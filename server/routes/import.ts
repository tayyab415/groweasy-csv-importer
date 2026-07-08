/**
 * POST /api/import — accept a CSV (multipart file field `file`, or JSON `{ csv }`)
 * and stream the AI extraction result back as newline-delimited JSON (NDJSON):
 *
 *   {"type":"progress","processed":25,"total":120}
 *   {"type":"progress","processed":50,"total":120}
 *   {"type":"result","result":{...ImportResult}}
 *
 * Streaming lets the frontend show a live progress bar during AI processing and
 * keeps the connection alive for large files.
 */
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { runImport } from "../services/importPipeline";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB, matching the UI's stated limit.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

export const importRouter = Router();

/** Extract CSV text from either an uploaded file or a JSON body. */
function getCsvText(req: Request): string | null {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (file?.buffer) return file.buffer.toString("utf-8");
  if (typeof req.body?.csv === "string") return req.body.csv;
  return null;
}

function writeEvent(res: Response, payload: unknown): void {
  res.write(JSON.stringify(payload) + "\n");
}

/** Run multer as a promise so its errors can be turned into clean JSON. */
function runUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single("file")(req, res, (err: unknown) => (err ? reject(err) : resolve()));
  });
}

importRouter.post("/import", async (req: Request, res: Response) => {
  // Handle upload errors (e.g. file > 5MB, malformed multipart) BEFORE we start
  // streaming, so the client gets a clean JSON error instead of Express's
  // default HTML error page mid-stream.
  try {
    await runUpload(req, res);
  } catch (err) {
    const tooBig = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
    res.status(tooBig ? 413 : 400).json({
      error: tooBig ? "File exceeds the 5MB limit." : "Could not read the uploaded file.",
    });
    return;
  }

  const csvText = getCsvText(req);

  if (!csvText || !csvText.trim()) {
    res.status(400).json({ error: "No CSV content provided." });
    return;
  }

  // Stream NDJSON. Status 200 headers are flushed immediately.
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no"); // disable proxy buffering

  try {
    const result = await runImport(csvText, {
      onProgress: (processed, total) => {
        writeEvent(res, { type: "progress", processed, total });
      },
    });
    writeEvent(res, { type: "result", result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    writeEvent(res, { type: "error", message });
  } finally {
    res.end();
  }
});
