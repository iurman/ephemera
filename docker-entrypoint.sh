#!/bin/sh
set -e

# Logging helper with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_section() {
    echo ""
    echo "========================================"
    log "$1"
    echo "========================================"
}

log_subsection() {
    echo ""
    log "==> $1"
}

log_detail() {
    echo "    $1"
}

log_section "Starting Ephemera Container"

# Container info
log_subsection "Container Information"
log_detail "Hostname: $(hostname)"
log_detail "User: $(whoami) (UID: $(id -u), GID: $(id -g))"
log_detail "Working Directory: $(pwd)"
log_detail "Date/Time: $(date)"

# System resources
log_subsection "System Resources"
if [ -f /proc/meminfo ]; then
    TOTAL_MEM=$(grep MemTotal /proc/meminfo | awk '{print int($2/1024)}')
    FREE_MEM=$(grep MemAvailable /proc/meminfo | awk '{print int($2/1024)}')
    log_detail "Memory: ${FREE_MEM}MB available / ${TOTAL_MEM}MB total"
fi
log_detail "CPUs: $(nproc 2>/dev/null || echo 'unknown')"

# Network info
log_subsection "Network Configuration"
log_detail "Network Interfaces:"
if command -v ip >/dev/null 2>&1; then
    ip addr show 2>/dev/null | grep -E "inet |^[0-9]" | sed 's/^/        /' || echo "        Unable to get network info"
elif command -v ifconfig >/dev/null 2>&1; then
    ifconfig 2>/dev/null | grep -E "inet |^[a-z]" | sed 's/^/        /' || echo "        Unable to get network info"
else
    log_detail "    Network tools not available"
fi

# DNS resolution test
log_subsection "DNS Resolution"
for host in db localhost; do
    if command -v getent >/dev/null 2>&1; then
        RESOLVED=$(getent hosts "$host" 2>/dev/null | head -1 || echo "unresolved")
        log_detail "$host -> $RESOLVED"
    elif command -v nslookup >/dev/null 2>&1; then
        RESOLVED=$(nslookup "$host" 2>/dev/null | grep -A1 "Name:" | tail -1 || echo "unresolved")
        log_detail "$host -> $RESOLVED"
    else
        log_detail "$host -> (DNS tools not available)"
    fi
done

# Environment variables (redacted)
log_subsection "Environment Variables"
log_detail "NODE_ENV: ${NODE_ENV:-not set}"
log_detail "SKIP_MIGRATIONS: ${SKIP_MIGRATIONS:-false}"
log_detail "PORT: ${PORT:-3000}"
log_detail "HOSTNAME: ${HOSTNAME:-not set}"
if [ -n "$DATABASE_URL" ]; then
    # Show redacted DATABASE_URL
    REDACTED_URL=$(echo "$DATABASE_URL" | sed 's/:\/\/[^:]*:[^@]*@/:\/\/***:***@/')
    log_detail "DATABASE_URL: $REDACTED_URL"
else
    log_detail "DATABASE_URL: not set"
fi

# Check required environment variables
if [ -z "$DATABASE_URL" ]; then
    log_section "ERROR: DATABASE_URL environment variable is not set"
    log_detail "Make sure POSTGRES_PASSWORD is set in your Coolify environment."
    log_detail "The DATABASE_URL is automatically constructed from:"
    log_detail "  - POSTGRES_USER (default: ephemera)"
    log_detail "  - POSTGRES_PASSWORD (required)"
    log_detail "  - POSTGRES_DB (default: ephemera)"
    exit 1
fi

# Parse and display database connection info (hide password)
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:\/]*\).*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')

log_subsection "Database Connection Details"
log_detail "Host: ${DB_HOST:-unknown}"
log_detail "Port: ${DB_PORT:-5432}"
log_detail "Database: ${DB_NAME:-unknown}"

# Test network connectivity to database host
log_subsection "Network Connectivity Test"
if command -v nc >/dev/null 2>&1; then
    log_detail "Testing TCP connection to ${DB_HOST}:${DB_PORT:-5432}..."
    if nc -z -w 5 "$DB_HOST" "${DB_PORT:-5432}" 2>/dev/null; then
        log_detail "TCP connection successful"
    else
        log_detail "TCP connection failed (this might be normal if DB is still starting)"
    fi
else
    log_detail "netcat not available, skipping TCP test"
fi

# Wait for database to be ready
log_subsection "Database Connection"
log "Waiting for database to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    log_detail "Attempt $RETRY_COUNT/$MAX_RETRIES: Connecting to database..."

    if node -e "
        const { Pool } = require('pg');
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            connectionTimeoutMillis: 5000
        });
        pool.query('SELECT 1 as health, current_database() as db, current_user as user, version() as version')
            .then((result) => {
                console.log('    Connection successful!');
                console.log('    Database: ' + result.rows[0].db);
                console.log('    User: ' + result.rows[0].user);
                console.log('    PostgreSQL: ' + result.rows[0].version.split(' ').slice(0,2).join(' '));
                pool.end();
                process.exit(0);
            })
            .catch((err) => {
                console.log('    Connection failed: ' + err.message);
                if (err.code) console.log('    Error code: ' + err.code);
                pool.end();
                process.exit(1);
            });
    " 2>&1; then
        log "Database is ready!"
        break
    fi

    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        log_detail "Retrying in 2 seconds..."
        sleep 2
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    log_section "ERROR: Could not connect to database after $MAX_RETRIES attempts"
    log_detail "Troubleshooting steps:"
    log_detail "1. Check that the 'db' service is running in Coolify"
    log_detail "2. Verify POSTGRES_PASSWORD is set in Coolify environment"
    log_detail "3. Check Coolify logs for the database container"
    log_detail "4. Ensure the database healthcheck is passing"
    log_detail "5. Check if containers are on the same Docker network"
    exit 1
fi

# Run database migrations
if [ "$SKIP_MIGRATIONS" != "true" ]; then
    log_subsection "Database Migrations"
    log "Running drizzle-kit push..."
    npx drizzle-kit push --force 2>&1 || {
        log_section "ERROR: Database migration failed"
        log_detail "Check the error above for details."
        log_detail "You can set SKIP_MIGRATIONS=true to skip migrations"
        exit 1
    }
    log "Migrations complete!"
else
    log_subsection "Database Migrations"
    log "Skipping migrations (SKIP_MIGRATIONS=true)"
fi

# Final startup
log_section "Starting Application"
log_detail "Port: 3000"
log_detail "Command: $@"
log_detail "Process will now hand off to Next.js..."
echo ""

exec "$@"
