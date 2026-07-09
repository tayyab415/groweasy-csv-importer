/**
 * Deterministic post-processing of AI output. The LLM does the intelligent
 * field *mapping*; this module enforces the hard rules from the assignment as a
 * safety net so the final records are always valid regardless of what the model
 * returns:
 *   - crm_status / data_source restricted to the allowed enums
 *   - created_at must be `new Date(created_at)`-convertible
 *   - multiple emails/mobiles -> keep the first, append the rest to crm_note
 *   - every field kept on a single CSV row (line breaks escaped to "\n")
 *   - a record with neither email nor mobile is skipped
 */
import {
  CRM_STATUS_VALUES,
  DATA_SOURCE_VALUES,
  CRM_FIELDS,
  type CrmRecord,
} from "../../shared/crm";

const STATUS_SET = new Set<string>(CRM_STATUS_VALUES);
const SOURCE_SET = new Set<string>(DATA_SOURCE_VALUES);

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Count the digits in a string. */
function digitCount(s: string): number {
  return (s.match(/\d/g) || []).length;
}

/**
 * Extract distinct phone numbers from a raw value. Splits on clear multi-number
 * delimiters (`,` `;` `/` `|` newline, " and "). A single number may contain
 * internal spaces/hyphens for formatting (e.g. `+91 98765 43210`), so we only
 * split a segment further on whitespace/hyphens when its digit count is too high
 * to be one number (>13) — which reliably separates space/hyphen-glued numbers
 * like `9876543210 9123456780` without breaking formatted single numbers.
 */
function extractPhones(value: string): string[] {
  const phones: string[] = [];
  for (const segment of value.split(/[,;/|\n]+|\s+and\s+/i)) {
    const seg = segment.trim();
    if (digitCount(seg) < 7) continue; // not a phone (e.g. "N/A")
    if (digitCount(seg) <= 13) {
      phones.push(seg);
    } else {
      // Multiple numbers glued together. Regroup the space/hyphen-split chunks
      // into full numbers by accumulating digits toward ~10, so formatted
      // numbers ("98765 43210") aren't shattered into too-short fragments.
      let current: string[] = [];
      let digits = 0;
      const flush = () => {
        if (current.length && digitCount(current.join(" ")) >= 7) {
          phones.push(current.join(" "));
        }
        current = [];
        digits = 0;
      };
      for (const token of seg.split(/[\s-]+/).filter(Boolean)) {
        current.push(token);
        digits += digitCount(token);
        if (digits >= 10) flush();
      }
      flush();
    }
  }
  return phones;
}

/** Collapse real line breaks into the two-char sequence `\n` (CSV-safe). */
function escapeNewlines(value: string): string {
  return value.replace(/\r\n|\r|\n/g, "\\n").trim();
}

/** Append a non-empty fragment to an existing note, avoiding duplicates. */
function appendNote(note: string, fragment: string): string {
  const clean = fragment.trim();
  if (!clean) return note;
  if (note.includes(clean)) return note;
  return note ? `${note} | ${clean}` : clean;
}

/** Return all trimmed regex matches in a value, or [] if none match. */
function findAll(value: string, re: RegExp): string[] {
  const matches = value.match(re);
  return matches ? matches.map((m) => m.trim()) : [];
}

export interface NormalizeOutcome {
  record: CrmRecord | null;
  /** Set when the record is skipped (no email and no mobile). */
  skipReason?: string;
}

/**
 * Normalize a single AI-produced record into a clean, rule-compliant CRM
 * record, or signal that it must be skipped.
 */
export function normalizeRecord(raw: CrmRecord): NormalizeOutcome {
  const record: CrmRecord = { ...raw };

  // Escape newlines and trim every field up front.
  for (const field of CRM_FIELDS) {
    record[field] = escapeNewlines(String(record[field] ?? ""));
  }

  // Enum enforcement.
  if (!STATUS_SET.has(record.crm_status)) record.crm_status = "";
  if (!SOURCE_SET.has(record.data_source)) record.data_source = "";

  // created_at must be JS-Date-convertible; blank it out if not.
  if (record.created_at) {
    const t = new Date(record.created_at).getTime();
    if (Number.isNaN(t)) record.created_at = "";
  }

  // Email: keep the first VALID email; extras go to crm_note. A field holding
  // only a placeholder (e.g. "N/A", "-", "not provided") matches no email and is
  // blanked, so the skip rule below can correctly drop the record.
  if (record.email) {
    const emails = findAll(record.email, EMAIL_RE);
    record.email = emails[0] ?? "";
    for (const extra of emails.slice(1)) {
      record.crm_note = appendNote(record.crm_note, `Additional email: ${extra}`);
    }
  }

  // Mobile: keep the first valid number, extras -> crm_note, blank placeholders.
  if (record.mobile_without_country_code) {
    const phones = extractPhones(record.mobile_without_country_code);
    record.mobile_without_country_code = phones[0] ?? "";
    for (const extra of phones.slice(1)) {
      record.crm_note = appendNote(record.crm_note, `Additional phone: ${extra}`);
    }
  }

  // Re-escape crm_note in case appended fragments reintroduced anything.
  record.crm_note = escapeNewlines(record.crm_note);

  // Skip rule: must have at least an email OR a mobile number.
  if (!record.email && !record.mobile_without_country_code) {
    return { record: null, skipReason: "No email or mobile number present" };
  }

  return { record };
}
