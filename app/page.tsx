"use client";

import { useMemo, useRef, useState } from "react";
import { parseCsvPreview, type CsvPreview } from "./lib/parseCsv";
import { importCsv } from "./lib/importClient";
import type { ImportResult } from "../shared/crm";
import Stepper from "./components/Stepper";
import ThemeToggle from "./components/ThemeToggle";
import UploadDropzone from "./components/UploadDropzone";
import DataTable, { type Column } from "./components/DataTable";
import ResultView from "./components/ResultView";

type Stage = "upload" | "preview" | "processing" | "result";

const PREVIEW_LIMIT = 100;

export default function Home() {
  const [stage, setStage] = useState<Stage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stepNumber = { upload: 1, preview: 2, processing: 3, result: 4 }[stage];

  async function handleFile(f: File) {
    setError(null);
    try {
      const text = await f.text();
      const parsed = parseCsvPreview(text);
      if (parsed.headers.length === 0 || parsed.totalRows === 0) {
        setError("This CSV appears to be empty or has no data rows.");
        return;
      }
      setFile(f);
      setPreview(parsed);
      setStage("preview");
    } catch (err) {
      setError(
        err instanceof Error && /malformed/i.test(err.message)
          ? err.message
          : "Could not read this file. Please try another CSV.",
      );
    }
  }

  async function handleConfirm() {
    if (!file) return;
    setStage("processing");
    setProgress({ processed: 0, total: preview?.totalRows ?? 0 });
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await importCsv(file, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      setResult(res);
      setStage("result");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Import failed. Please try again.");
      setStage("preview");
    }
  }

  function reset() {
    abortRef.current?.abort();
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setProgress({ processed: 0, total: 0 });
    setStage("upload");
  }

  const previewColumns: Column[] = useMemo(
    () => (preview?.headers ?? []).map((h, i) => ({ key: `${i}`, label: h })),
    [preview],
  );
  const previewRows = useMemo(() => preview?.rows.slice(0, PREVIEW_LIMIT) ?? [], [preview]);

  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="min-h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M7 14l4-4 3 3 5-6" />
              </svg>
            </span>
            <div className="leading-tight">
              <div className="text-sm font-bold text-[var(--text)]">GrowEasy</div>
              <div className="text-xs text-[var(--text-muted)]">AI CSV Importer</div>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 flex flex-col gap-4 sm:mb-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)] sm:text-3xl">
              Import Leads via CSV
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-muted)]">
              Upload any CSV — from Facebook, Google Ads, spreadsheets, or another CRM.
              Our AI maps the columns into the GrowEasy CRM format automatically.
            </p>
          </div>
          <Stepper current={stepNumber} />
        </div>

        {/* Step 1 — Upload */}
        {stage === "upload" && <UploadDropzone onFile={handleFile} error={error} />}

        {/* Step 2 — Preview */}
        {stage === "preview" && preview && (
          <div className="animate-fade-in-up space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                </span>
                <div>
                  <div className="font-medium text-[var(--text)]">{file?.name}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {preview.totalRows} rows · {preview.headers.length} columns
                    {preview.totalRows > PREVIEW_LIMIT && ` · showing first ${PREVIEW_LIMIT}`}
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>
            )}

            <DataTable columns={previewColumns} rows={previewRows} />

            <div className="flex flex-wrap justify-end gap-3">
              <button
                onClick={reset}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface-2)]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600"
              >
                Confirm &amp; Import
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Processing */}
        {stage === "processing" && (
          <div className="animate-fade-in-up rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
            <div className="mx-auto mb-6 h-10 w-10 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-500" />
            <p className="text-lg font-semibold text-[var(--text)]">Extracting CRM records…</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              The AI is mapping your columns. This may take a moment for large files.
            </p>
            <div className="mx-auto mt-6 max-w-md">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all duration-300"
                  style={{ width: `${Math.max(pct, 6)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                {progress.total > 0
                  ? `${progress.processed} / ${progress.total} rows (${pct}%)`
                  : "Starting…"}
              </p>
            </div>
          </div>
        )}

        {/* Step 4 — Result */}
        {stage === "result" && result && <ResultView result={result} onReset={reset} />}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-center text-xs text-[var(--text-muted)] sm:px-6">
        Built for GrowEasy · Powered by Gemini
      </footer>
    </div>
  );
}
