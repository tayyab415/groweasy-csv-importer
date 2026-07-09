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

  // Match the backend: reject structurally-broken CSVs (unterminated quotes) up
  // front so the user sees a clear error at preview time rather than confirming a
  // corrupted preview that only fails after the AI call.
  const fatal = result.errors.find((e) => e.type === "Quotes");
  if (fatal) {
    const where = typeof fatal.row === "number" ? ` near row ${fatal.row + 1}` : "";
    throw new Error(`This CSV appears malformed (${fatal.message}${where}). Please fix it and re-upload.`);
  }

  // Use the widest row so jagged rows (more cells than headers) still show all
  // their cells in the preview. Duplicate headers are made unique (matching the
  // backend's `phone`, `phone_2`, ...) so the confirmation table reflects the
  // distinct fields the AI will actually receive.
  const maxCols = table.reduce((m, r) => Math.max(m, r.length), 0);
  const used = new Set<string>();
  const headers = Array.from({ length: maxCols }, (_, i) => {
    const base = (table[0][i] ?? "").trim() || `Column ${i + 1}`;
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base}_${n++}`;
    used.add(name);
    return name;
  });
  const rows = table.slice(1).map((r) => headers.map((_, i) => (r[i] ?? "").toString()));

  return { headers, rows, totalRows: rows.length };
}
