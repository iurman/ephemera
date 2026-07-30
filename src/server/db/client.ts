import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Reuse the pool across dev HMR reloads so we don't leak connections.
const globalForDb = globalThis as unknown as { __ephemeraPool?: Pool };

// On serverless platforms each instance holds its own pool, so keep it
// small there (and point DATABASE_URL at a pooled endpoint, e.g. Neon's
// PgBouncer URL). DB_POOL_MAX overrides in either direction.
const configuredMax = parseInt(process.env.DB_POOL_MAX ?? "", 10);
const poolMax =
  Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : process.env.VERCEL ? 3 : 10;

const pool =
  globalForDb.__ephemeraPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: poolMax,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__ephemeraPool = pool;
}

export const db: NodePgDatabase = drizzle(pool);
export type Database = typeof db;
