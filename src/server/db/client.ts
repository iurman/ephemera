import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Reuse the pool across dev HMR reloads so we don't leak connections.
const globalForDb = globalThis as unknown as { __ephemeraPool?: Pool };

const pool =
  globalForDb.__ephemeraPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__ephemeraPool = pool;
}

export const db: NodePgDatabase = drizzle(pool);
export type Database = typeof db;
