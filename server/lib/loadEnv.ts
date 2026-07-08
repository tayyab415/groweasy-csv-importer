/**
 * Side-effect module that loads a local `.env` as early as possible. It MUST be
 * imported before any module that reads `process.env` at import time (e.g.
 * geminiExtractor's DEFAULT_MODEL / DEFAULT_BATCH_SIZE), because ES module
 * imports are evaluated before the importing module's body runs. Cloud Run
 * injects env vars directly, so a missing `.env` is expected in production.
 */
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file present — fine in production */
}
