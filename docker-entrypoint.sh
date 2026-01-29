#!/bin/sh
set -e

echo "==> Starting Ephemera..."

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable is not set"
    exit 1
fi

# Wait for database to be ready
echo "==> Waiting for database..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if node -e "
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        pool.query('SELECT 1')
            .then(() => { pool.end(); process.exit(0); })
            .catch(() => { pool.end(); process.exit(1); });
    " 2>/dev/null; then
        echo "==> Database is ready!"
        break
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "    Waiting for database... (attempt $RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "ERROR: Could not connect to database after $MAX_RETRIES attempts"
    exit 1
fi

# Run database migrations
if [ "$SKIP_MIGRATIONS" != "true" ]; then
    echo "==> Running database migrations..."
    npx drizzle-kit push --force || {
        echo "ERROR: Database migration failed"
        exit 1
    }
    echo "==> Migrations complete!"
else
    echo "==> Skipping migrations (SKIP_MIGRATIONS=true)"
fi

echo "==> Starting application..."
exec "$@"
