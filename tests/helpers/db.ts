import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import type { Database } from "@/server/db/client";
import type { Context, AuthenticatedUser } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/root";
import { resetRateLimits } from "@/server/security/rateLimit";

/**
 * In-memory Postgres (PGlite) with the real migration files applied — the
 * exact SQL that runs in production, no schema drift.
 */
export async function createTestDb(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const pgliteDb = drizzle(client);
  await migrate(pgliteDb, {
    migrationsFolder: path.resolve(__dirname, "..", "..", "drizzle"),
  });
  // Structurally compatible query-builder API; the cast is contained here.
  return {
    db: pgliteDb as unknown as Database,
    close: () => client.close(),
  };
}

let ipCounter = 0;

export function makeCtx(
  db: Database,
  user: AuthenticatedUser | null = null,
  overrides: Partial<Context> = {},
): Context {
  return {
    db,
    sid: null,
    ip: `203.0.113.${++ipCounter % 250}`,
    userAgent: "vitest",
    setCookies: [],
    user,
    ...overrides,
  };
}

export function makeCaller(
  db: Database,
  user: AuthenticatedUser | null = null,
  overrides: Partial<Context> = {},
) {
  const ctx = makeCtx(db, user, overrides);
  return { caller: appRouter.createCaller(ctx), ctx };
}

export { resetRateLimits };
