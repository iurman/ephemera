import { and, eq, gt } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/server/db/client";
import { users, sessions } from "@/server/db/schema";
import { renewSessionIfStale } from "@/server/auth/session";
import type { UserRole } from "@/lib/types";

export interface AuthenticatedUser {
  id: string;
  displayName: string;
  email: string | null;
  role: UserRole;
}

export interface Context {
  db: Database;
  sid: string | null;
  ip: string | null;
  userAgent: string | null;
  setCookies: string[];
  user: AuthenticatedUser | null;
}

export interface ContextInit {
  sid: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Override for tests. */
  db?: Database;
}

async function loadUser(
  db: Database,
  sid: string | null,
  setCookies: string[],
): Promise<AuthenticatedUser | null> {
  if (!sid) return null;

  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      role: users.role,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  await renewSessionIfStale(db, sid, row.expiresAt, setCookies);

  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    role: row.role as UserRole,
  };
}

export async function createContext(init: ContextInit): Promise<Context> {
  const db = init.db ?? defaultDb;
  const setCookies: string[] = [];
  return {
    db,
    sid: init.sid,
    ip: init.ip ?? null,
    userAgent: init.userAgent ?? null,
    setCookies,
    user: await loadUser(db, init.sid, setCookies),
  };
}
