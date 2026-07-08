/**
 * Combined server entrypoint: a single Node process that runs BOTH the Express
 * API (under /api/*) and the Next.js frontend (everything else). Deployed as one
 * container to Cloud Run — one origin, no CORS.
 */
import next from "next";
import { createApiApp } from "./app";

// Load a local .env for development (Cloud Run injects env vars directly).
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file — fine in production */
}

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
