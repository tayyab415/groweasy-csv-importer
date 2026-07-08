/**
 * Express application factory. Kept separate from the server entrypoint so the
 * API can be unit-tested without booting Next.js.
 */
import express, { type Express } from "express";
import { importRouter } from "./routes/import";
import { rateLimit } from "./lib/rateLimit";

const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 5 * 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 30);

export function createApiApp(): Express {
  const app = express();

  // Cloud Run terminates TLS at a proxy; trust it so req.ip / X-Forwarded-For
  // reflect the real client for rate limiting.
  app.set("trust proxy", true);

  // JSON bodies (for the `{ csv }` variant). Generous limit for large pastes;
  // multipart uploads are handled per-route by multer.
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", model: process.env.GEMINI_MODEL || "gemini-3.5-flash" });
  });

  // Throttle the public, unauthenticated import route to bound Gemini abuse.
  app.use(
    "/api/import",
    rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX }),
  );

  app.use("/api", importRouter);

  return app;
}
