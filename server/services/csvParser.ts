/**
 * Server-side CSV parsing (the backend is the source of truth — it re-parses the
 * uploaded file rather than trusting the client's preview). Uses PapaParse with
 * header detection and robust quote handling.
 */
import Papa from "papaparse";
import type { CsvRow } from "./geminiExtractor";

export interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
  /** Short raw text preview per row (for the "skipped" list in the UI). */
  previews: Map<number, string>;
}

/**
 * Trim/normalize headers. Blank headers become positional (`column_N`), and
 * duplicate headers are made unique (`phone`, `phone_2`, ...) so no source
 * column is silently overwritten when a CSV repeats a header name.
 */
function normalizeHeaders(fields: string[]): string[] {
  const counts = new Map<string, number>();
  return fields.map((f, i) => {
    const base = (f ?? "").trim() || `column_${i + 1}`;
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return seen === 0 ? base : `${base}_${seen + 1}`;
  });
}

/**
 * Parse CSV text into indexed rows. Empty rows are dropped. Each row keeps its
 * original header->value mapping so the AI can reason about column meaning.
 */
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  const table = (result.data as unknown as string[][]).filter(
    (r) => Array.isArray(r) && r.length > 0,
  );
  if (table.length === 0) {
    return { headers: [], rows: [], previews: new Map() };
  }

  const headers = normalizeHeaders(table[0]);
  const rows: CsvRow[] = [];
  const previews = new Map<number, string>();

  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    // Skip fully-empty rows.
    if (cells.every((c) => (c ?? "").trim() === "")) continue;

    const rowNum = rows.length + 1; // 1-based data row index
    const data: Record<string, string> = {};
    headers.forEach((h, idx) => {
      data[h] = (cells[idx] ?? "").toString();
    });

    rows.push({ row: rowNum, data });
    previews.set(
      rowNum,
      cells
        .join(", ")
        .replace(/\s+/g, " ")
        .slice(0, 120),
    );
  }

  return { headers, rows, previews };
}
