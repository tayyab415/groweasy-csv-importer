/**
 * Combined server entrypoint: a single Node process that runs BOTH the Express
 * API (under /api/*) and the Next.js frontend (everything else). Deployed as one
 * container to Cloud Run — one origin, no CORS.
 */
// Import first: loads .env before any module that reads process.env at import
// time (e.g. geminiExtractor's DEFAULT_MODEL / DEFAULT_BATCH_SIZE).
import "./lib/loadEnv";
import next from "next";
import { createApiApp } from "./app";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || "0.0.0.0";

async function main() {
  const nextApp = next({ dev, hostname, port });
  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();

  const server = createApiApp();

  // Any request not handled by /api falls through to the Next.js renderer.
  server.use((req, res) => {
    handle(req, res);
  });

  server.listen(port, hostname, () => {
    // eslint-disable-next-line no-console
    console.log(`> GrowEasy CSV Importer ready on http://${hostname}:${port} (dev=${dev})`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal server error:", err);
  process.exit(1);
});
