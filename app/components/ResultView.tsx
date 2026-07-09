"use client";

import { CRM_FIELDS, CRM_FIELD_LABELS, type ImportResult } from "../../shared/crm";
import DataTable, { type Column } from "./DataTable";
import StatusBadge from "./StatusBadge";

interface ResultViewProps {
  result: ImportResult;
  onReset: () => void;
}

const WIDE = new Set(["email", "crm_note", "description", "created_at", "name"]);

const columns: Column[] = CRM_FIELDS.map((field) => ({
  key: field,
  label: CRM_FIELD_LABELS[field],
  width: WIDE.has(field) ? 230 : 160,
  render:
    field === "crm_status"
      ? (value) => <StatusBadge value={value} />
      : undefined,
}));

/**
 * Escape a CSV cell (records already have real newlines escaped to `\n`).
 * Also neutralizes CSV formula injection: a value starting with = + - @ or a
 * control char can be executed as a formula by Excel/Sheets, so it is prefixed
 * with a single quote before quoting.
 */
function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function buildCsv(result: ImportResult): string {
  const header = CRM_FIELDS.join(",");
  const lines = result.records.map((r) => CRM_FIELDS.map((f) => csvCell(r[f] ?? "")).join(","));
  return [header, ...lines].join("\n");
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "brand" | "green" | "muted" }) {
  const toneCls =
    tone === "green"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "brand"
        ? "text-brand-600 dark:text-brand-400"
        : "text-[var(--text-muted)]";
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
      <div className={`font-display text-3xl ${toneCls}`}>{value}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </div>
    </div>
  );
}

export default function ResultView({ result, onReset }: ResultViewProps) {
  const recordRows = result.records.map((r) => CRM_FIELDS.map((f) => r[f] ?? ""));

  function downloadCsv() {
    const blob = new Blob([buildCsv(result)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "groweasy_crm_import.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total Imported" value={result.totalImported} tone="green" />
        <Stat label="Total Skipped" value={result.totalSkipped} tone="muted" />
        <Stat label="Rows Processed" value={result.totalRows} tone="brand" />
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-[var(--text)]">
            Extracted CRM Records
          </h2>
          <div className="flex gap-2">
            <button
              onClick={downloadCsv}
              disabled={result.records.length === 0}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              Download CSV
            </button>
            <button
              onClick={onReset}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              Import another
            </button>
          </div>
        </div>
        <DataTable columns={columns} rows={recordRows} emptyText="No records were imported." />
      </div>

      {result.skipped.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">
            Skipped rows ({result.skipped.length})
          </h3>
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
            {result.skipped.map((s) => (
              <div
                key={s.row}
                className="flex flex-col gap-1 border-b border-[var(--border)] px-4 py-3 text-sm last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
              >
                <span className="shrink-0 font-medium text-[var(--text-muted)]">Row {s.row}</span>
                <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                  {s.reason}
                </span>
                <span className="truncate text-[var(--text-muted)]" title={s.preview}>
                  {s.preview}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
