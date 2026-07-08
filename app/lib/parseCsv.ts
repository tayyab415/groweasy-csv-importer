import Papa from "papaparse";

export interface CsvPreview {
  headers: string[];
  /** Rows as arrays aligned to `headers` (raw strings, for the preview table). */
  rows: string[][];
  totalRows: number;
}

/**
 * Parse CSV text on the client purely for the Step-2 preview. This is display
 * only — the backend re-parses the file as the source of truth. No AI here.
 */
export function parseCsvPreview(text: string): CsvPreview {
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  const table = (result.data as unknown as string[][]).filter(
    (r) => Array.isArray(r) && r.some((c) => (c ?? "").trim() !== ""),
  );

  if (table.length === 0) {
    return { headers: [], rows: [], totalRows: 0 };
  }

  const headers = table[0].map((h, i) => (h ?? "").trim() || `Column ${i + 1}`);
  const rows = table.slice(1).map((r) => headers.map((_, i) => (r[i] ?? "").toString()));

  return { headers, rows, totalRows: rows.length };
}
