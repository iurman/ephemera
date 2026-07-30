import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../playwright.config";

/**
 * Reset the e2e database to a blank slate, then apply the real migrations
 * through the same script production uses.
 */
export default async function globalSetup() {
  const pool = new pg.Pool({ connectionString: E2E_DATABASE_URL, max: 1 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("CREATE SCHEMA public");
  } finally {
    await pool.end();
  }

  // Playwright runs this from the repo root.
  execFileSync(process.execPath, [path.resolve("scripts/migrate.mjs")], {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: "inherit",
  });
}
