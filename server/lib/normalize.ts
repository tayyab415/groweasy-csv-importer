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
 * Strip leading word-labels/conjunctions ("Call", "Mobile:", "or") and trailing
 * separator noise from a phone candidate, while preserving a leading "+" country
 * code and the number's internal spaces/hyphens (e.g. `+91 98765 43210`).
 */
function cleanPhone(seg: string): string {
  return seg
    .replace(/^(?:[A-Za-z]+[\s:.\-]+)+/, "")
    .replace(/[\s.\-]+$/, "")
    .trim();
}

/**
 * Extract distinct phone numbers from a raw value. Splits on clear multi-number
 * delimiters (`,` `;` `/` `|` newline, " and ", " or "). A single number may
 * contain internal spaces/hyphens for formatting (e.g. `+91 98765 43210`), so we
 * only split a segment further on whitespace/hyphens when its digit count is too
 * high to be one number (>13) — which reliably separates space/hyphen-glued
 * numbers like `9876543210 9123456780` without breaking formatted single
 * numbers. Each candidate is label-stripped so conjunctions/prefixes don't leak
 * into the stored value.
 */
function extractPhones(value: string): string[] {
  const phones: string[] = [];
  const push = (raw: string) => {
    const p = cleanPhone(raw);
    if (digitCount(p) >= 7) phones.push(p);
  };
  for (const segment of value.split(/[,;/|\n]+|\s+(?:and|or)\s+/i)) {
    const seg = cleanPhone(segment.trim());
    if (digitCount(seg) < 7) continue; // not a phone (e.g. "N/A")
    if (digitCount(seg) <= 13) {
      push(seg);
    } else {
      // Multiple numbers glued together. Regroup the space/hyphen-split chunks
      // into full numbers by accumulating digits toward ~10, so formatted
      // numbers ("98765 43210") aren't shattered into too-short fragments.
      let current: string[] = [];
      let digits = 0;
      const flush = () => {
        if (current.length && digitCount(current.join(" ")) >= 7) {
          push(current.join(" "));
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

/** Just the digits of a string. */
function digitsOf(s: string): string {
  return (s.match(/\d/g) || []).join("");
}

/**
 * If a phone starts with a `+<country code>` followed by a separator, split the
 * code out (e.g. "+91 98765 43210" -> code "+91", local "98765 43210"). This runs
 * even when `country_code` is already populated — the code the phone carries must
 * never remain glued to the local number (the model sometimes fills both fields
 * with the code). Glued numbers without a separator are left as-is (the split
 * point would be ambiguous).
 */
function splitCountryCode(phone: string, existingCode: string): { code: string; local: string } {
  const m = phone.match(/^\+\s*(\d{1,3})[\s-]+(\d.*)$/);
  if (m) return { code: `+${m[1]}`, local: m[2].trim() };
  return { code: existingCode, local: phone };
}

export interface NormalizeOutcome {
  record: CrmRecord | null;
  /** Set when the record is skipped (no email and no mobile). */
  skipReason?: string;
}

/**
 * Normalize a single AI-produced record into a clean, rule-compliant CRM
 * record, or signal that it must be skipped.
 *
 * When `source` (the raw source row, as the array of its cell values, or a single
 * string) is provided, extracted emails/phones are validated against it: any
 * contact the model returns that does NOT appear in the source is discarded as a
 * hallucination / prompt-injection artifact, so the skip rule can't be bypassed
 * by fabricated contact info. Phone digits must appear within a SINGLE source
 * cell — never spread across the concatenation of unrelated numeric columns
 * (e.g. a fake `1234567890` assembled from a `unit`=12345 and `zip`=67890).
 */
export function normalizeRecord(raw: CrmRecord, source?: string | string[]): NormalizeOutcome {
  const record: CrmRecord = { ...raw };

  // Source contact allow-lists for anti-hallucination validation (see below).
  const srcCells: string[] | null = Array.isArray(source)
    ? source
    : source != null
      ? [source]
      : null;
  const srcLowerJoined = srcCells?.map((c) => c.toLowerCase()).join(" ") ?? null;
  const srcCellDigits = srcCells?.map((c) => digitsOf(c)) ?? null;
  const emailInSource = (e: string) =>
    srcLowerJoined == null || srcLowerJoined.includes(e.toLowerCase());
  const phoneInSource = (p: string) => {
    if (srcCellDigits == null) return true;
    const d = digitsOf(p);
    if (d.length < 7) return false;
    return srcCellDigits.some((cell) => cell.includes(d));
  };

  // Coerce + trim every field, normalizing BOTH real newlines and AI-escaped
  // ("\n") line breaks to real newlines. The model is told to escape line breaks
  // as \n, so multi-value contact fields can arrive pre-escaped; converting them
  // now lets email/phone extraction split correctly. Everything is re-escaped at
  // the very end so each record stays a single CSV row.
  for (const field of CRM_FIELDS) {
    record[field] = String(record[field] ?? "")
      .replace(/\\r\\n|\\n|\\r/g, "\n")
      .trim();
  }

  // Enum enforcement.
  if (!STATUS_SET.has(record.crm_status)) record.crm_status = "";
  if (!SOURCE_SET.has(record.data_source)) record.data_source = "";

  // created_at must be JS-Date-convertible; blank it out if not.
  if (record.created_at) {
    const t = new Date(record.created_at).getTime();
    if (Number.isNaN(t)) record.created_at = "";
  }

  // Email: keep the first VALID email present in the source; extras -> crm_note.
  // Placeholders ("N/A") match no email and are blanked; emails not found in the
  // source row are dropped as hallucinated so the skip rule stays trustworthy.
  if (record.email) {
    const emails = findAll(record.email, EMAIL_RE).filter(emailInSource);
    record.email = emails[0] ?? "";
    for (const extra of emails.slice(1)) {
      record.crm_note = appendNote(record.crm_note, `Additional email: ${extra}`);
    }
  }

  // Mobile: keep the first valid, source-backed number; split its country code
  // into country_code when possible; extras -> crm_note; placeholders blanked.
  if (record.mobile_without_country_code) {
    const phones = extractPhones(record.mobile_without_country_code).filter(phoneInSource);
    const primary = phones[0] ?? "";
    if (primary) {
      const { code, local } = splitCountryCode(primary, record.country_code);
      record.country_code = code;
      record.mobile_without_country_code = local;
    } else {
      record.mobile_without_country_code = "";
    }
    for (const extra of phones.slice(1)) {
      record.crm_note = appendNote(record.crm_note, `Additional phone: ${extra}`);
    }
  }

  // Now that contacts are extracted, escape newlines in EVERY field so each
  // record stays a single, valid CSV row.
  for (const field of CRM_FIELDS) {
    record[field] = escapeNewlines(record[field]);
  }

  // Skip rule: must have at least an email OR a mobile number.
  if (!record.email && !record.mobile_without_country_code) {
    return { record: null, skipReason: "No email or mobile number present" };
  }

  return { record };
}
