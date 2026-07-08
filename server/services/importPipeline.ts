/**
 * Orchestrates the full import: parse CSV -> AI extract in batches -> enforce
 * rules -> assemble the ImportResult (with skipped accounting).
 */
import { parseCsv } from "./csvParser";
import { extractRecords, type ExtractOptions } from "./geminiExtractor";
import { normalizeRecord } from "../lib/normalize";
import type { ImportResult, SkippedRecord } from "../../shared/crm";

export interface RunImportOptions extends ExtractOptions {}

/**
 * Run the pipeline over raw CSV text. `onProgress` reports AI-batch progress
 * (0..total) so the route can stream it to the browser.
 */
export async function runImport(
  csvText: string,
  options: RunImportOptions = {},
): Promise<ImportResult> {
  const { rows, previews } = parseCsv(csvText);

  if (rows.length === 0) {
    return { records: [], skipped: [], totalImported: 0, totalSkipped: 0, totalRows: 0 };
  }

  const extracted = await extractRecords(rows, options);

  const records: ImportResult["records"] = [];
  const skipped: SkippedRecord[] = [];

  for (const { row, record } of extracted) {
    const outcome = normalizeRecord(record);
    if (outcome.record) {
      records.push(outcome.record);
    } else {
      skipped.push({
        row,
        reason: outcome.skipReason ?? "Invalid record",
        preview: previews.get(row) ?? "",
      });
    }
  }

  return {
    records,
    skipped,
    totalImported: records.length,
    totalSkipped: skipped.length,
    totalRows: rows.length,
  };
}
