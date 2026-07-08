#!/usr/bin/env bash
# Deploy the GrowEasy CSV Importer to Google Cloud Run.
# Builds the Dockerfile via Cloud Build and deploys as a single service.
#
# Usage:
#   GEMINI_API_KEY=xxx ./scripts/deploy.sh [PROJECT_ID] [REGION] [SERVICE]
#
# Requires: gcloud (authenticated), a GEMINI_API_KEY.
set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${2:-asia-south1}"
SERVICE="${3:-groweasy-csv-importer}"

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "ERROR: set GEMINI_API_KEY in the environment before deploying." >&2
  exit 1
fi
if [[ -z "${PROJECT_ID}" ]]; then
  echo "ERROR: no GCP project set. Pass one or run: gcloud config set project <id>" >&2
  exit 1
fi

echo "Deploying '${SERVICE}' to project '${PROJECT_ID}' in '${REGION}'..."

gcloud run deploy "${SERVICE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --source . \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --update-env-vars "GEMINI_API_KEY=${GEMINI_API_KEY},GEMINI_MODEL=${GEMINI_MODEL:-gemini-3.5-flash}"

echo "Done. Service URL:"
gcloud run services describe "${SERVICE}" --project "${PROJECT_ID}" --region "${REGION}" \
  --format 'value(status.url)'
