import type { ImportResult } from "../../shared/crm";

export interface ImportProgress {
  processed: number;
  total: number;
}

export interface ImportHandlers {
  onProgress?: (p: ImportProgress) => void;
  signal?: AbortSignal;
}

/**
 * Upload the CSV file to the backend and consume the NDJSON stream, forwarding
 * progress events and resolving with the final ImportResult. Throws on an error
 * event or transport failure so the caller can show an error state.
 */
export async function importCsv(
  file: File,
  { onProgress, signal }: ImportHandlers = {},
): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/import", { method: "POST", body: form, signal });

  if (!res.ok || !res.body) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ImportResult | null = null;

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const event = JSON.parse(trimmed) as
      | { type: "progress"; processed: number; total: number }
      | { type: "result"; result: ImportResult }
      | { type: "error"; message: string };

    if (event.type === "progress") {
      onProgress?.({ processed: event.processed, total: event.total });
    } else if (event.type === "result") {
      result = event.result;
    } else if (event.type === "error") {
      throw new Error(event.message);
    }
  };

  // Read the stream line-by-line.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      handleLine(line);
    }
  }
  if (buffer.trim()) handleLine(buffer);

  if (!result) throw new Error("No result returned from the server.");
  return result;
}
