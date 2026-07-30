#!/bin/sh
set -e

if [ "$SKIP_MIGRATIONS" = "true" ]; then
  echo "[entrypoint] SKIP_MIGRATIONS=true — skipping database migrations"
else
  echo "[entrypoint] running database migrations"
  node scripts/migrate.mjs
fi

echo "[entrypoint] starting ephemera"
exec "$@"
