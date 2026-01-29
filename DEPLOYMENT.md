# Deploying Ephemera

This guide covers deploying Ephemera using Docker, with specific instructions for Coolify.

## Quick Start with Docker Compose

### Production (with bundled PostgreSQL)

```bash
# Set required environment variables
export POSTGRES_PASSWORD=your-secure-password

# Start the stack
docker compose -f docker-compose.production.yml up -d
```

### Production (with external database)

```bash
# Set your database URL
export DATABASE_URL=postgres://user:pass@host:5432/dbname

# Start the app only
docker compose -f docker-compose.coolify.yml up -d
```

## Deploying to Coolify

### Option 1: Using Coolify's Built-in PostgreSQL

1. **Create a new Service** in Coolify
2. **Select "Docker Compose"** as the deployment method
3. **Connect your Git repository**
4. **Set the compose file** to `docker-compose.coolify.yml`
5. **Add a PostgreSQL database** from Coolify's database section
6. **Configure Environment Variables**:
   - `DATABASE_URL`: Use the connection string from Coolify's PostgreSQL service

7. **Deploy!**

### Option 2: All-in-One Stack

1. **Create a new Service** in Coolify
2. **Select "Docker Compose"** as the deployment method
3. **Connect your Git repository**
4. **Set the compose file** to `docker-compose.production.yml`
5. **Configure Environment Variables**:
   - `POSTGRES_PASSWORD`: A secure password for the database
   - `POSTGRES_USER`: (optional, default: `ephemera`)
   - `POSTGRES_DB`: (optional, default: `ephemera`)

6. **Deploy!**

### Option 3: Dockerfile Only

1. **Create a new Service** in Coolify
2. **Select "Dockerfile"** as the deployment method
3. **Connect your Git repository**
4. **Configure Environment Variables**:
   - `DATABASE_URL`: Your PostgreSQL connection string

5. **Deploy!**

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `NODE_ENV` | No | `production` | Environment mode |
| `PORT` | No | `3000` | Port to listen on |
| `SKIP_MIGRATIONS` | No | `false` | Skip database migrations on startup |

### Development Only

| Variable | Description |
|----------|-------------|
| `DEV_ADMIN_USER` | Username for /dev-login (disabled in production) |
| `DEV_ADMIN_PASS` | Password for /dev-login (disabled in production) |

## Health Checks

The application exposes a health check endpoint at `/api/ping` which returns a 200 OK when healthy.

## First-Time Setup

After deployment:

1. Visit your app's URL
2. Navigate to `/dashboard`
3. Create the initial owner account when prompted
4. Generate invite links to add more users

## Database Migrations

Migrations run automatically on startup via the entrypoint script. To skip migrations:

```bash
SKIP_MIGRATIONS=true
```

## Troubleshooting

### Container won't start

1. Check logs: `docker compose logs app`
2. Verify `DATABASE_URL` is correct
3. Ensure PostgreSQL is running and accessible

### Migration errors

1. Check database connectivity
2. Ensure the database user has CREATE/ALTER permissions
3. Try running migrations manually:
   ```bash
   docker compose exec app npx drizzle-kit push --force
   ```

### Health check failing

1. Wait for the start period (30s)
2. Check application logs for errors
3. Verify the `/api/ping` endpoint is accessible

## Building Locally

```bash
# Build the Docker image
docker build -t ephemera .

# Run with external database
docker run -p 3000:3000 -e DATABASE_URL=postgres://... ephemera
```

## Architecture

```
┌─────────────────────────────────────────────┐
│                   Coolify                    │
├─────────────────────────────────────────────┤
│  ┌─────────────┐      ┌─────────────────┐   │
│  │   Ephemera  │─────▶│   PostgreSQL    │   │
│  │   (Next.js) │      │   (Database)    │   │
│  └─────────────┘      └─────────────────┘   │
│         │                                    │
│         ▼                                    │
│  ┌─────────────┐                            │
│  │   Traefik   │  (Coolify's reverse proxy) │
│  └─────────────┘                            │
└─────────────────────────────────────────────┘
```
