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
/** Loose phone matcher: optional +, then 7+ digits allowing spaces/-/() . */
const PHONE_RE = /\+?[\d][\d\s().-]{6,}\d/g;

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

/**
 * Split a field that may contain several emails/phones. Returns the first match
 * and the remainder (to be pushed into crm_note). Falls back to the raw trimmed
 * value when nothing matches the pattern.
 */
function splitMulti(value: string, re: RegExp): { first: string; rest: string[] } {
  const matches = value.match(re);
  if (!matches || matches.length === 0) {
    return { first: value.trim(), rest: [] };
  }
  const cleaned = matches.map((m) => m.trim());
  return { first: cleaned[0], rest: cleaned.slice(1) };
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

  // Multiple emails -> first stays, rest go to crm_note.
  if (record.email) {
    const { first, rest } = splitMulti(record.email, EMAIL_RE);
    record.email = first;
    for (const extra of rest) {
      record.crm_note = appendNote(record.crm_note, `Additional email: ${extra}`);
    }
  }

  // Multiple mobiles -> first stays, rest go to crm_note.
  if (record.mobile_without_country_code) {
    const { first, rest } = splitMulti(record.mobile_without_country_code, PHONE_RE);
    record.mobile_without_country_code = first;
    for (const extra of rest) {
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
