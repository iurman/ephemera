#!/bin/sh
set -e

echo "========================================"
echo "==> Starting Ephemera..."
echo "========================================"
echo ""
echo "==> Environment:"
echo "    NODE_ENV: ${NODE_ENV:-not set}"
echo "    SKIP_MIGRATIONS: ${SKIP_MIGRATIONS:-false}"
echo ""

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable is not set"
    echo ""
    echo "Make sure POSTGRES_PASSWORD is set in your Coolify environment."
    echo "The DATABASE_URL is automatically constructed from:"
    echo "  - POSTGRES_USER (default: ephemera)"
    echo "  - POSTGRES_PASSWORD (required)"
    echo "  - POSTGRES_DB (default: ephemera)"
    exit 1
fi

# Parse and display database connection info (hide password)
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:\/]*\).*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
echo "==> Database connection:"
echo "    Host: ${DB_HOST:-unknown}"
echo "    Port: ${DB_PORT:-5432}"
echo "    Database: ${DB_NAME:-unknown}"
echo ""

# Wait for database to be ready
echo "==> Waiting for database to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "    Attempt $RETRY_COUNT/$MAX_RETRIES: Connecting to database..."

    if node -e "
        const { Pool } = require('pg');
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            connectionTimeoutMillis: 5000
        });
        pool.query('SELECT 1')
            .then(() => {
                console.log('    Connection successful!');
                pool.end();
                process.exit(0);
            })
            .catch((err) => {
                console.log('    Connection failed: ' + err.message);
                pool.end();
                process.exit(1);
            });
    " 2>&1; then
        echo ""
        echo "==> Database is ready!"
        break
    fi

    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo "    Retrying in 2 seconds..."
        sleep 2
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo ""
    echo "========================================"
    echo "ERROR: Could not connect to database after $MAX_RETRIES attempts"
    echo "========================================"
    echo ""
    echo "Troubleshooting steps:"
    echo "1. Check that the 'db' service is running in Coolify"
    echo "2. Verify POSTGRES_PASSWORD is set in Coolify environment"
    echo "3. Check Coolify logs for the database container"
    echo "4. Ensure the database healthcheck is passing"
    echo ""
    exit 1
fi

# Run database migrations
echo ""
if [ "$SKIP_MIGRATIONS" != "true" ]; then
    echo "==> Running database migrations..."
    echo ""
    npx drizzle-kit push --force 2>&1 || {
        echo ""
        echo "========================================"
        echo "ERROR: Database migration failed"
        echo "========================================"
        echo ""
        echo "Check the error above for details."
        exit 1
    }
    echo ""
    echo "==> Migrations complete!"
else
    echo "==> Skipping migrations (SKIP_MIGRATIONS=true)"
fi

echo ""
echo "========================================"
echo "==> Starting application on port 3000..."
echo "========================================"
echo ""
exec "$@"
