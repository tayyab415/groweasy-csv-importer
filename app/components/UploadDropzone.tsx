"use client";

import { useCallback, useRef, useState } from "react";

interface UploadDropzoneProps {
  onFile: (file: File) => void;
  error?: string | null;
}

const MAX_BYTES = 5 * 1024 * 1024;

function isCsv(file: File): boolean {
  return (
    file.type === "text/csv" ||
    file.type === "application/vnd.ms-excel" ||
    file.name.toLowerCase().endsWith(".csv")
  );
}

/** Step 1 — drag & drop + file picker upload with validation. */
export default function UploadDropzone({ onFile, error }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const validateAndSend = useCallback(
    (file: File | undefined) => {
      setLocalError(null);
      if (!file) return;
      if (!isCsv(file)) {
        setLocalError("Please upload a .csv file.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setLocalError("File is larger than 5 MB.");
        return;
      }
      onFile(file);
    },
    [onFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      validateAndSend(e.dataTransfer.files?.[0]);
    },
    [validateAndSend],
  );

  const shownError = localError || error;

  return (
    <div className="animate-fade-in-up">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        className={`group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition ${
          dragging
            ? "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10"
            : "border-[var(--border)] bg-[var(--surface)] hover:border-brand-400"
        }`}
      >
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand-100 text-brand-600 transition group-hover:scale-105 dark:bg-brand-500/15">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-[var(--text)]">Drop your CSV file here</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">or click to browse files</p>
        <p className="mt-4 text-xs text-[var(--text-muted)]">Supported: .csv · up to 5 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => validateAndSend(e.target.files?.[0])}
        />
      </div>

      {shownError && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {shownError}
        </p>
      )}
    </div>
  );
}
