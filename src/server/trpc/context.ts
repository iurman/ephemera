import { db } from "@/server/db/client";
import { users, sessions } from "@/server/db/schema";
import { and, eq, gt } from "drizzle-orm";

/** The tRPC context type used everywhere. */
export type Context = {
  db: typeof db;
  sid: string | null;
  /** Any Set-Cookie strings your resolvers push will be emitted by the route handler */
  setCookies: string[];
  /** The currently authenticated user if a valid session cookie was provided */
  user: null | {
    id: string;
    displayName: string;
    role: "owner" | "admin" | "user";
  };
};

/** Resolve the user from a session id (sid) if it exists and is not expired. */
async function loadUserFromSid(sid: string | null): Promise<Context["user"]> {
  if (!sid) return null;
  const now = new Date();

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      role: users.role,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, now)))
    .limit(1);

  if (!rows.length) return null;
  const u = rows[0];
  return { id: u.id, displayName: u.displayName, role: u.role as any };
}

/**
 * createContext is called by the Next.js route handler and receives the sid
 * we parsed from the incoming Cookie header.
 */
export async function createContext(init: { sid: string | null }): Promise<Context> {
  return {
    db,
    sid: init.sid,
    setCookies: [],
    user: await loadUserFromSid(init.sid),
  };
}
