/**
 * Side-effect module that loads a local `.env` as early as possible. It MUST be
 * imported before any module that reads `process.env` at import time (e.g.
 * geminiExtractor's DEFAULT_MODEL / DEFAULT_BATCH_SIZE), because ES module
 * imports are evaluated before the importing module's body runs. Cloud Run
 * injects env vars directly, so a missing `.env` is expected in production.
 */
if (typeof process.loadEnvFile !== "function") {
  // Older Node (< 20.12) lacks loadEnvFile. Don't fail silently — a local run
  // would otherwise start without GEMINI_API_KEY and only error on first import.
  console.warn(
    "[loadEnv] process.loadEnvFile is unavailable (Node < 20.12). " +
      "Set environment variables directly (e.g. `node --env-file=.env`).",
  );
} else {
  try {
    process.loadEnvFile(".env");
  } catch (err) {
    // A missing .env is expected in production; surface anything else.
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.warn(`[loadEnv] failed to load .env: ${(err as Error).message}`);
    }
  }
}
