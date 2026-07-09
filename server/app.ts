/**
 * Express application factory. Kept separate from the server entrypoint so the
 * API can be unit-tested without booting Next.js.
 */
import express, { type Express } from "express";
import { importRouter } from "./routes/import";
import { rateLimit } from "./lib/rateLimit";

/** Coerce a value to a positive integer, falling back when invalid. */
function positiveIntOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

// Validated so a malformed env value (e.g. RATE_LIMIT_MAX=abc -> NaN) can't
// silently disable throttling (`count > NaN` is always false).
const RATE_LIMIT_WINDOW_MS = positiveIntOr(process.env.RATE_LIMIT_WINDOW_MS, 5 * 60 * 1000);
const RATE_LIMIT_MAX = positiveIntOr(process.env.RATE_LIMIT_MAX, 30);

export function createApiApp(): Express {
  const app = express();

  // Cloud Run sits behind exactly one Google front-end proxy. Trusting a single
  // hop makes req.ip the address that proxy observed (the real client) while
  // ignoring caller-supplied X-Forwarded-For entries — so the rate-limit key
  // can't be spoofed. (`true` would trust the whole chain and be spoofable.)
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 1));

  // JSON bodies (for the `{ csv }` variant). Kept just above the route's 5MB CSV
  // cap so the parser doesn't buffer far more than the cap into memory, while
  // still letting a 5-6MB body reach the route and get the friendly 413 message.
  app.use(express.json({ limit: "6mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
      apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // Throttle the public, unauthenticated import route to bound Gemini abuse.
  app.use(
    "/api/import",
    rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX }),
  );

  app.use("/api", importRouter);

  return app;
}
