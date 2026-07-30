import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { sessions } from "@/server/db/schema";

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SESSION_COOKIE = "sid";

export function makeSessionCookie(id: string, exp: Date): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(id)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${exp.toUTCString()}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${new Date(0).toUTCString()}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export async function createSession(
  db: Database,
  userId: string,
  setCookies: string[],
): Promise<{ sid: string; expiresAt: Date }> {
  const sid = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db.insert(sessions).values({ id: sid, userId, expiresAt });
  setCookies.push(makeSessionCookie(sid, expiresAt));
  return { sid, expiresAt };
}

/**
 * Sliding renewal: once a session is past the halfway point of its lifetime,
 * extend it and refresh the cookie so active users are never logged out.
 */
export async function renewSessionIfStale(
  db: Database,
  sid: string,
  expiresAt: Date,
  setCookies: string[],
): Promise<void> {
  const remaining = expiresAt.getTime() - Date.now();
  if (remaining > SESSION_DURATION_MS / 2) return;
  const next = new Date(Date.now() + SESSION_DURATION_MS);
  await db.update(sessions).set({ expiresAt: next }).where(eq(sessions.id, sid));
  setCookies.push(makeSessionCookie(sid, next));
}
