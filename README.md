# GrowEasy — AI CSV Importer

Upload **any** CSV — Facebook lead exports, Google Ads, Excel sheets, real-estate
CRM dumps, hand-made spreadsheets — and an LLM intelligently maps the arbitrary
columns onto the fixed **GrowEasy CRM schema**. The hard part isn't parsing CSV;
it's understanding messy, inconsistent columns and extracting clean CRM records.

> **Live demo:** https://groweasy-csv-importer-yp6clo7qna-el.a.run.app
> **Stack:** Next.js 16 (App Router) · Express 5 · Google Gemini · TypeScript · Cloud Run

---

## How it works

```
Upload CSV ──▶ Client-side preview ──▶ Confirm ──▶ POST /api/import
                (no AI yet)                          │
                                                     ▼
                              parse (source of truth) ─▶ batch rows ─▶ Gemini
                                                     │                   │
                              enforce rulebook ◀── normalize ◀── validate JSON
                                                     │
                                                     ▼
                              stream progress (NDJSON) ─▶ results table
```

- **Frontend & backend run in one process** (a Next.js custom server that also
  hosts the Express API), so the whole thing deploys as a **single Cloud Run
  container** — one origin, no CORS.
- **AI does the mapping; code enforces the rules.** Gemini maps columns; a
  deterministic normalizer then guarantees the hard constraints (valid enums,
  `new Date()`-parseable dates, first-email/rest-to-note, single CSV row, skip
  rows with no contact info).

## The 4-step flow

1. **Upload** — drag & drop or file picker (`.csv`, ≤ 5 MB).
2. **Preview** — parsed client-side into a responsive, sticky-header,
   scrollable, virtualized table. **No AI runs yet.**
3. **Confirm** — only now does the frontend call the backend.
4. **Result** — AI-extracted CRM records in a table, with **imported** /
   **skipped** counts and per-row skip reasons. Live progress bar while the AI
   works.

## CRM schema & rules

15 fields: `created_at, name, email, country_code, mobile_without_country_code,
company, city, state, country, lead_owner, crm_status, crm_note, data_source,
possession_time, description`.

- `crm_status` ∈ `GOOD_LEAD_FOLLOW_UP · DID_NOT_CONNECT · BAD_LEAD · SALE_DONE`
  (synonyms mapped intelligently, else blank).
- `data_source` ∈ `leads_on_demand · meridian_tower · eden_park · varah_swamy ·
  sarjapur_plots` (else blank).
- `created_at` is always `new Date(created_at)`-parseable (blanked if not).
- Multiple emails/phones → first kept, rest appended to `crm_note`.
- Every record stays a single valid CSV row (line breaks escaped to `\n`).
- A row with **neither email nor mobile** is skipped (and reported).

## Local development

```bash
npm install
cp .env.example .env      # add your GEMINI_API_KEY
npm run dev               # http://localhost:3000
```

Requires Node 20+ and a [Gemini API key](https://aistudio.google.com/apikey).

### Scripts

| command            | what it does                              |
| ------------------ | ----------------------------------------- |
| `npm run dev`      | dev server (Next + Express, hot reload)   |
| `npm run build`    | production Next.js build                  |
| `npm start`        | production server                         |
| `npm test`         | unit tests (Vitest)                       |
| `npm run typecheck`| TypeScript type check                     |

## Environment variables

| var                 | required | default            | notes                        |
| ------------------- | -------- | ------------------ | ---------------------------- |
| `GEMINI_API_KEY`    | ✅       | —                  | Google Gemini API key        |
| `GEMINI_MODEL`      |          | `gemini-3.5-flash` | extraction model             |
| `GEMINI_BATCH_SIZE` |          | `25`               | rows per AI batch            |
| `PORT`              |          | `3000`             | Cloud Run sets this          |

## Project structure

```
shared/          CRM schema, enums, Zod validation (shared FE/BE contract)
server/
  index.ts       combined Next + Express entrypoint
  app.ts         Express app factory (unit-testable)
  routes/        /api/import (NDJSON streaming), /api/health
  services/      csvParser · geminiExtractor (batching+retry) · importPipeline
  lib/           prompt (AI instructions) · normalize (rule enforcement)
app/             Next.js frontend (upload → preview → confirm → result)
tests/           Vitest unit tests (parser, normalizer, pipeline, health & sanity)
```

## License

MIT — see [LICENSE](./LICENSE).

### Extended Testing
The test suite covers:
- `schemaValidation.test.ts`: Zod schema verification for CRM field mapping.
- `health.test.ts`: Sanity checks for CSV parser and server health endpoints.

