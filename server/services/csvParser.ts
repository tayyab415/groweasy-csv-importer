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
 * column is silently overwritten when a CSV repeats a header name. Uniqueness
 * is checked against ALL names already used, so even a pre-existing `phone_2`
 * cannot collide with a generated one.
 */
function normalizeHeaders(fields: string[]): string[] {
  const used = new Set<string>();
  return fields.map((f, i) => {
    const base = (f ?? "").trim() || `column_${i + 1}`;
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base}_${n++}`;
    used.add(name);
    return name;
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

  // Reject only genuinely-corrupting parse errors — unterminated/mismatched
  // quotes shift and truncate columns, so we must not feed them to the AI.
  // We intentionally do NOT treat other error types as fatal:
  //   - `Delimiter` (UndetectableDelimiter) fires for valid single-column files
  //     like `email\na@b.com`, which are plausible uploads and parse fine.
  //   - `FieldMismatch` (jagged rows) is tolerated — the app must accept messy
  //     but recoverable data.
  const fatal = result.errors.filter((e) => e.type === "Quotes");
  if (fatal.length > 0) {
    const e = fatal[0];
    const where = typeof e.row === "number" ? ` near row ${e.row + 1}` : "";
    throw new Error(
      `CSV appears malformed (${e.message}${where}). Please fix the file and re-upload.`,
    );
  }

  const headers = normalizeHeaders(table[0]);
  const headerSet = new Set(headers);
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

    // A jagged row can have MORE cells than the header row. Rather than drop
    // that data (which could discard the only email/phone and wrongly skip the
    // lead), give the extra cells generated, non-colliding `column_N` keys so
    // the AI still sees them.
    for (let idx = headers.length; idx < cells.length; idx++) {
      const value = (cells[idx] ?? "").toString();
      if (value.trim() === "") continue;
      let key = `column_${idx + 1}`;
      let n = 2;
      while (headerSet.has(key) || key in data) key = `column_${idx + 1}_${n++}`;
      data[key] = value;
    }

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
