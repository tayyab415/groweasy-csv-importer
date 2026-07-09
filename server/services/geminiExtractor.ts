/**
 * Gemini-backed CRM extraction. Rows are sent to the model in batches with a
 * strict JSON response schema; each batch retries with backoff on failure.
 */
import { GoogleGenAI, Type } from "@google/genai";
import { CrmRecordSchema, emptyCrmRecord, type CrmRecord } from "../../shared/crm";
import { SYSTEM_INSTRUCTION, buildBatchPrompt } from "../lib/prompt";

export interface CsvRow {
  /** 1-based index of the row in the original CSV (excluding header). */
  row: number;
  data: Record<string, string>;
}

/** One extracted record tied back to its source row. */
export interface ExtractedRow {
  row: number;
  record: CrmRecord;
  /**
   * True when the AI produced NO data for this row — either the batch failed
   * after all retries, or the model omitted the row from its output. Lets the
   * pipeline report an extraction failure instead of mislabeling the row as
   * "contactless".
   */
  failed: boolean;
}

export interface ExtractOptions {
  model?: string;
  batchSize?: number;
  maxRetries?: number;
  /** Fired after each batch so callers can stream progress to the client. */
  onProgress?: (processed: number, total: number) => void;
}

/** Coerce a value to a positive integer, falling back when invalid. */
function positiveIntOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const DEFAULT_BATCH_SIZE = positiveIntOr(process.env.GEMINI_BATCH_SIZE, 25);
const DEFAULT_MAX_RETRIES = 3;

/** Response schema forcing a flat array of string-only CRM objects. */
const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      row: { type: Type.INTEGER },
      created_at: { type: Type.STRING },
      name: { type: Type.STRING },
      email: { type: Type.STRING },
      country_code: { type: Type.STRING },
      mobile_without_country_code: { type: Type.STRING },
      company: { type: Type.STRING },
      city: { type: Type.STRING },
      state: { type: Type.STRING },
      country: { type: Type.STRING },
      lead_owner: { type: Type.STRING },
      crm_status: { type: Type.STRING },
      crm_note: { type: Type.STRING },
      data_source: { type: Type.STRING },
      possession_time: { type: Type.STRING },
      description: { type: Type.STRING },
    },
    required: ["row"],
    propertyOrdering: [
      "row",
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
    ],
  },
} as const;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lazily construct the client so the module can be imported without a key. */
function makeClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Cannot run AI extraction.");
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Extract one batch. Returns a map of row-number -> validated CRM record.
 * Retries transient failures with exponential backoff.
 */
async function extractBatch(
  ai: GoogleGenAI,
  model: string,
  rows: CsvRow[],
  maxRetries: number,
): Promise<Map<number, CrmRecord>> {
  const prompt = buildBatchPrompt(rows);
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0,
        },
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from model");

      const parsed = JSON.parse(text) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) throw new Error("Model did not return an array");

      const byRow = new Map<number, CrmRecord>();
      for (const item of parsed) {
        const rowNum = Number(item.row);
        if (!Number.isFinite(rowNum)) continue;
        // Keep the FIRST record for a given row; if the model mistakenly repeats
        // a row number, a later duplicate must not clobber earlier data.
        if (byRow.has(rowNum)) continue;
        byRow.set(rowNum, CrmRecordSchema.parse(item));
      }
      return byRow;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        await sleep(500 * 2 ** attempt); // 0.5s, 1s, 2s ...
      }
    }
  }

  throw new Error(
    `Batch failed after ${maxRetries + 1} attempts: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

/**
 * Extract CRM records for all rows. Batches that ultimately fail are not fatal:
 * their rows fall back to an empty record keyed by row number, so the caller can
 * still account for every input row (they will be skipped downstream for having
 * no email/mobile). This keeps one bad batch from sinking the whole import.
 */
export async function extractRecords(
  rows: CsvRow[],
  options: ExtractOptions = {},
): Promise<ExtractedRow[]> {
  const model = options.model || DEFAULT_MODEL;
  const batchSize = positiveIntOr(options.batchSize, DEFAULT_BATCH_SIZE);
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const ai = makeClient();

  const batches = chunk(rows, batchSize);
  const results: ExtractedRow[] = [];
  let processed = 0;

  for (const batch of batches) {
    let byRow: Map<number, CrmRecord>;
    try {
      byRow = await extractBatch(ai, model, batch, maxRetries);
    } catch {
      byRow = new Map(); // whole batch failed after retries
    }

    for (const { row } of batch) {
      const record = byRow.get(row);
      // A row missing from the model output (batch failure or omission) has no
      // extracted data — flag it so it is reported as an extraction failure.
      results.push({ row, record: record ?? emptyCrmRecord(), failed: !record });
    }

    processed += batch.length;
    options.onProgress?.(processed, rows.length);
  }

  results.sort((a, b) => a.row - b.row);
  return results;
}
