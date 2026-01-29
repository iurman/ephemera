import { db } from "@/server/db/client";
import { users, sessions } from "@/server/db/schema";
import { and, eq, gt } from "drizzle-orm";
import type { UserRole } from "@/lib/types";

export interface AuthenticatedUser {
  id: string;
  displayName: string;
  role: UserRole;
}

export interface Context {
  db: typeof db;
  sid: string | null;
  setCookies: string[];
  user: AuthenticatedUser | null;
}

async function loadUserFromSid(sid: string | null): Promise<AuthenticatedUser | null> {
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
  return {
    id: u.id,
    displayName: u.displayName,
    role: u.role as UserRole,
  };
}

export async function createContext(init: { sid: string | null }): Promise<Context> {
  return {
    db,
    sid: init.sid,
    setCookies: [],
    user: await loadUserFromSid(init.sid),
  };
}
