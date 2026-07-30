#!/usr/bin/env bash
# Run the Playwright e2e suite locally inside the official Playwright image
# (no browser system deps needed on the host).
#
# Prereqs:
#   docker compose -f docker-compose.dev.yml up -d
#   docker compose -f docker-compose.dev.yml exec db psql -U postgres -c 'CREATE DATABASE ephemera_e2e' # first time
set -euo pipefail
cd "$(dirname "$0")/.."

PLAYWRIGHT_VERSION="$(node -p "require('@playwright/test/package.json').version")"
E2E_DATABASE_URL="${E2E_DATABASE_URL:-postgres://postgres:postgres@localhost:5433/ephemera_e2e}"

# .next caches are machine-specific; a container build must start clean.
rm -rf .next

exec docker run --rm --network host \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e E2E_DATABASE_URL="$E2E_DATABASE_URL" \
  -v "$PWD:/work" -w /work \
  "mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble" \
  bash -c "npx next build && npx playwright test"
