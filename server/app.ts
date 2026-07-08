/**
 * Express application factory. Kept separate from the server entrypoint so the
 * API can be unit-tested without booting Next.js.
 */
import express, { type Express } from "express";
import { importRouter } from "./routes/import";

export function createApiApp(): Express {
  const app = express();

  // JSON bodies (for the `{ csv }` variant). Generous limit for large pastes;
  // multipart uploads are handled per-route by multer.
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", model: process.env.GEMINI_MODEL || "gemini-3.5-flash" });
  });

  app.use("/api", importRouter);

  return app;
}
