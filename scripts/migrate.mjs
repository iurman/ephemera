#!/usr/bin/env node
/**
 * Migration runner with legacy-database baseline stamping.
 *
 * Uses only `pg` (which Next's standalone output traces into the runtime
 * image) and applies drizzle-kit's generated SQL with the exact bookkeeping
 * drizzle's own migrator uses: rows in drizzle.__drizzle_migrations with
 * hash = sha256(file contents) and created_at = the journal's "when" millis;
 * a migration runs when its "when" is newer than the last applied row.
 *
 * Extra behavior on top of stock drizzle:
 * - Ephemera originally deployed with `drizzle-kit push`, so live databases
 *   have all the tables but no migration history. When we detect that
 *   (tables exist, no history), we stamp the baseline migration as applied
 *   instead of failing on CREATE TABLE.
 * - Connection retry loop, because the app container can win the race
 *   against Postgres at stack startup.
 *
 * Usage: DATABASE_URL=postgres://... node scripts/migrate.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(__dirname, "..", "drizzle");

const CONNECT_ATTEMPTS = 30;
const CONNECT_DELAY_MS = 2000;

function log(msg) {
  console.log(`[migrate] ${msg}`);
}

function readMigrations() {
  const journal = JSON.parse(
    fs.readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
  );
  return journal.entries.map((entry) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), "utf8");
    return {
      tag: entry.tag,
      when: entry.when,
      hash: crypto.createHash("sha256").update(sql).digest("hex"),
      statements: sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  });
}

async function connectWithRetry(url) {
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt++) {
    const pool = new pg.Pool({ connectionString: url, max: 1 });
    try {
      await pool.query("SELECT 1");
      return pool;
    } catch (err) {
      await pool.end().catch(() => {});
      if (attempt === CONNECT_ATTEMPTS) {
        throw new Error(`Database unreachable after ${attempt} attempts: ${err.message}`);
      }
      log(`waiting for database (${attempt}/${CONNECT_ATTEMPTS})...`);
      await new Promise((r) => setTimeout(r, CONNECT_DELAY_MS));
    }
  }
}

async function tableExists(pool, schema, table) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  return rows.length > 0;
}

async function ensureMigrationsTable(pool) {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at bigint
     )`,
  );
}

async function stampBaselineIfNeeded(pool, migrations) {
  const hasHistory = await tableExists(pool, "drizzle", "__drizzle_migrations");
  if (hasHistory) return;

  const hasLegacySchema = await tableExists(pool, "public", "drops");
  if (!hasLegacySchema) return; // fresh database — migrator builds everything

  const baseline = migrations[0];
  log(`legacy database detected (tables exist, no migration history)`);
  log(`stamping baseline "${baseline.tag}" as applied`);
  await ensureMigrationsTable(pool);
  await pool.query(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`, [
    baseline.hash,
    baseline.when,
  ]);
}

async function applyMigrations(pool, migrations) {
  await ensureMigrationsTable(pool);
  const { rows } = await pool.query(
    `SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`,
  );
  const lastApplied = rows[0] ? Number(rows[0].created_at) : 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const migration of migrations) {
      if (migration.when <= lastApplied) continue;
      log(`applying ${migration.tag}`);
      for (const stmt of migration.statements) {
        await client.query(stmt);
      }
      await client.query(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
        [migration.hash, migration.when],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is not set");
    process.exit(1);
  }

  const migrations = readMigrations();
  const pool = await connectWithRetry(url);
  try {
    await stampBaselineIfNeeded(pool, migrations);
    await applyMigrations(pool, migrations);
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
    log(`up to date (${rows[0].n} migrations applied)`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
