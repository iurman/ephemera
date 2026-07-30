import { sql, and, eq, gt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users, sessions } from "@/server/db/schema";

/**
 * Readiness/diagnostics endpoint.
 *
 * Unauthenticated callers get a bare status (needed for orchestrator
 * readiness checks that should reflect database health). Admin sessions get
 * the diagnostic details — environment internals aren't leaked publicly.
 */
export async function GET(req: Request) {
  const started = Date.now();
  let dbOk = false;
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
    dbLatencyMs = Date.now() - started;
  } catch (err) {
    dbError = err instanceof Error ? err.message : "unknown error";
  }

  const base = {
    status: dbOk ? "healthy" : "unhealthy",
    database: dbOk ? "connected" : "error",
  };

  const isAdmin = await callerIsAdmin(req);
  const body = isAdmin
    ? {
        ...base,
        dbLatencyMs,
        dbError,
        node: process.version,
        env: process.env.NODE_ENV,
        memory: {
          rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
          heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
        uptimeSec: Math.floor(process.uptime()),
      }
    : base;

  return Response.json(body, {
    status: dbOk ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}

async function callerIsAdmin(req: Request): Promise<boolean> {
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.match(/(?:^|;\s*)sid=([^;]+)/);
  if (!m) return false;
  try {
    const rows = await db
      .select({ role: users.role })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, decodeURIComponent(m[1])), gt(sessions.expiresAt, new Date())))
      .limit(1);
    const role = rows[0]?.role;
    return role === "admin" || role === "owner";
  } catch {
    return false;
  }
}
