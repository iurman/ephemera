# Deploying Ephemera

Ephemera ships as a single Docker image (Next.js standalone, Node 22) plus PostgreSQL 16. Migrations run automatically at container start.

## Compose files

| File                          | Purpose                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| `docker-compose.yml`          | Full stack (app + Postgres) for Coolify/production         |
| `docker-compose.override.yml` | Local-only overrides, auto-merged by `docker compose up`   |
| `docker-compose.dev.yml`      | Dev database only (`npm run dev` runs the app on the host) |

## Coolify

1. Create a **Docker Compose** service and connect this repository (default compose file).
2. Set `POSTGRES_PASSWORD` in the environment.
3. Deploy. The `app` service carries Traefik labels for `ephemera.isaacurman.com` (edit the labels in `docker-compose.yml` for your domain), joins the `coolify` network, and health-checks `/api/ping`.

On first boot the entrypoint runs `scripts/migrate.mjs`:

- **Fresh database** → all migrations apply from scratch.
- **Existing pre-migration database** (originally deployed with `drizzle-kit push`) → the runner detects tables without migration history, stamps the baseline as applied, then applies only the newer migrations. No manual intervention, no data loss.
- **Already migrated** → no-op.

## Environment variables

| Variable                        | Required        | Default                            | Description                                   |
| ------------------------------- | --------------- | ---------------------------------- | --------------------------------------------- |
| `DATABASE_URL`                  | app-only setups | built from `POSTGRES_*` in compose | PostgreSQL connection string                  |
| `POSTGRES_PASSWORD`             | compose stack   | —                                  | Database password                             |
| `POSTGRES_USER` / `POSTGRES_DB` | no              | `ephemera`                         | Database identity                             |
| `HOST_PORT`                     | no              | `3000`                             | Published app port                            |
| `RETENTION_DAYS`                | no              | `3`                                | Days before dead drops' ciphertext is blanked |
| `VIEWS_RETENTION_DAYS`          | no              | `30`                               | Days of view-log retention                    |
| `PURGE_INTERVAL_MIN`            | no              | `60`                               | Minutes between retention sweeps              |
| `SKIP_MIGRATIONS`               | no              | `false`                            | Skip migrations at startup                    |

## Health checks

- `/api/ping` — liveness (static 200, used by Docker/Traefik)
- `/api/health` — readiness incl. database connectivity; returns full diagnostics (memory, latency, versions) only to logged-in admins, a bare status to everyone else

## First-time setup

Visit `/login` on the deployed instance — with an empty database it becomes the owner-setup form (display name, email, password). After that, mint invite links from the dashboard to add users.

## Upgrading from the pre-v2 deployment

Nothing special: push/deploy. The migration runner baselines the legacy schema automatically (see above). Two behavioral notes:

- Legacy drops were stored as plaintext (`enc_version = 0`); they keep working and render through the same reveal flow. New drops are E2E encrypted.
- `/dev-login` and the `DEV_ADMIN_*` variables are gone. If the legacy owner account has no password, log in is impossible for it — create your account via the invite flow from a new owner, or set a password directly in SQL (`users.password_hash` uses `salt:hex(scrypt64)`).

## Troubleshooting

- **Container restarts on boot** — check `docker compose logs app`; almost always `DATABASE_URL`/credentials. The migrator retries the connection for 60s before giving up.
- **Migration failure** — the runner applies each release's migrations in one transaction; a failure rolls back cleanly. Fix the cause and redeploy.
- **Health check failing** — `/api/health` returns 503 when the database is unreachable.
