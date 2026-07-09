/**
 * Shared CRM contract used by the backend (extraction + validation) and the
 * frontend (typing the API response). Single source of truth for the GrowEasy
 * CRM schema, the allowed enum values, and field ordering.
 */
import { z } from "zod";

/** Allowed `crm_status` values. The AI must pick exactly one (or leave blank). */
export const CRM_STATUS_VALUES = [
  "GOOD_LEAD_FOLLOW_UP",
  "DID_NOT_CONNECT",
  "BAD_LEAD",
  "SALE_DONE",
] as const;
export type CrmStatus = (typeof CRM_STATUS_VALUES)[number] | "";

/** Allowed `data_source` values. Leave blank if none matches confidently. */
export const DATA_SOURCE_VALUES = [
  "leads_on_demand",
  "meridian_tower",
  "eden_park",
  "varah_swamy",
  "sarjapur_plots",
] as const;
export type DataSource = (typeof DATA_SOURCE_VALUES)[number] | "";

/**
 * The 15 GrowEasy CRM fields, in canonical order. Used for CSV export column
 * ordering and for rendering the results table consistently.
 */
export const CRM_FIELDS = [
  "created_at",
  "name",
  "email",
  "country_code",
  "mobile_without_country_code",
  "company",
  "city",
  "state",
  "country",
  "lead_owner",
  "crm_status",
  "crm_note",
  "data_source",
  "possession_time",
  "description",
] as const;
export type CrmField = (typeof CRM_FIELDS)[number];

/** Human-friendly labels/descriptions for each field (used in the UI header). */
export const CRM_FIELD_LABELS: Record<CrmField, string> = {
  created_at: "Created At",
  name: "Name",
  email: "Email",
  country_code: "Country Code",
  mobile_without_country_code: "Mobile",
  company: "Company",
  city: "City",
  state: "State",
  country: "Country",
  lead_owner: "Lead Owner",
  crm_status: "CRM Status",
  crm_note: "CRM Note",
  data_source: "Data Source",
  possession_time: "Possession Time",
  description: "Description",
};

/**
 * Zod schema for a single CRM record as returned by the AI. Every field is a
 * string (blank when unknown) so the output is always a valid, flat CSV row.
 * `.catch("")` makes parsing resilient to a model that omits a field or emits a
 * non-string — we normalize to "" rather than throwing away the whole batch.
 */
export const CrmRecordSchema = z.object({
  created_at: z.string().catch(""),
  name: z.string().catch(""),
  email: z.string().catch(""),
  country_code: z.string().catch(""),
  mobile_without_country_code: z.string().catch(""),
  company: z.string().catch(""),
  city: z.string().catch(""),
  state: z.string().catch(""),
  country: z.string().catch(""),
  lead_owner: z.string().catch(""),
  crm_status: z.string().catch(""),
  crm_note: z.string().catch(""),
  data_source: z.string().catch(""),
  possession_time: z.string().catch(""),
  description: z.string().catch(""),
});
export type CrmRecord = z.infer<typeof CrmRecordSchema>;

/** A record the pipeline chose to skip, with the reason (for the results UI). */
export interface SkippedRecord {
  /** 1-based row index in the original CSV (excluding the header). */
  row: number;
  reason: string;
  /** A short preview of the raw row so the user can see what was dropped. */
  preview: string;
}

/** Final import result returned by the backend once extraction completes. */
export interface ImportResult {
  records: CrmRecord[];
  skipped: SkippedRecord[];
  totalImported: number;
  totalSkipped: number;
  /** Total data rows read from the CSV (imported + skipped). */
  totalRows: number;
}

/** An empty, fully-blank CRM record (handy for defaults/merging). */
export function emptyCrmRecord(): CrmRecord {
  return Object.fromEntries(CRM_FIELDS.map((f) => [f, ""])) as CrmRecord;
}
