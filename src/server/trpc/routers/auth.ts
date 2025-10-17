import { z } from "zod";
import { router, publicProcedure } from "../index";
import { db } from "../../db/client";
import { users, sessions, invites } from "../../db/schema";
import { and, eq, isNull, gt } from "drizzle-orm";
import crypto from "crypto";

/* ---------- helpers ---------- */
function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function makeSessionCookie(id: string, exp: Date) {
  const parts = [
    `sid=${encodeURIComponent(id)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${exp.toUTCString()}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

// Simple (but solid) scrypt-based password hashing
function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const buf = crypto.scryptSync(password, salt, 64);
  return `${salt}:${buf.toString("hex")}`;
}
function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [salt, hex] = stored.split(":");
  const hash = Buffer.from(hex, "hex");
  const test = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(hash, test);
}

/* ---------- router ---------- */
export const authRouter = router({
  me: publicProcedure.query(async ({ ctx }) => ctx.user),

  bootstrapOwner: publicProcedure
    .input(z.object({ displayName: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.select({ id: users.id }).from(users).limit(1);
      if (existing.length > 0) return { ok: false as const, error: "Already bootstrapped" };

      const uid = crypto.randomUUID();
      await db.insert(users).values({ id: uid, displayName: input.displayName, role: "owner" });

      const sid = crypto.randomUUID();
      const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(sessions).values({ id: sid, userId: uid, expiresAt: exp });

      ctx.setCookies.push(makeSessionCookie(sid, exp));
      return { ok: true as const };
    }),

  createInvite: publicProcedure
    .input(z.object({ expiresMinutes: z.number().int().min(1).max(7 * 24 * 60).default(60) }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user || (ctx.user.role !== "owner" && ctx.user.role !== "admin")) {
        return { ok: false as const, error: "Unauthorized" };
      }
      const raw = crypto.randomBytes(24).toString("base64url");
      const id = crypto.randomUUID();
      const exp = new Date(Date.now() + input.expiresMinutes * 60 * 1000);
      await db.insert(invites).values({
        id,
        tokenHash: hashToken(raw),
        createdBy: ctx.user.id,
        expiresAt: exp,
        maxUses: 1,
      });
      return { ok: true as const, url: `/signup?token=${raw}` };
    }),

  // Sign up using invite (creates session automatically)
  consumeInvite: publicProcedure
    .input(z.object({
      token: z.string(),
      displayName: z.string().min(1),
      email: z.string().email().optional(),
      password: z.string().min(6, "Password must be at least 6 characters"),
    }))
    .mutation(async ({ input, ctx }) => {
      const tokenHash = hashToken(input.token);
      const [inv] = await db
        .select()
        .from(invites)
        .where(and(eq(invites.tokenHash, tokenHash), isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
        .limit(1);
      if (!inv) return { ok: false as const, error: "Invalid or used invite" };

      // Create user
      const uid = crypto.randomUUID();
      await db.insert(users).values({
        id: uid,
        displayName: input.displayName,
        email: input.email ?? null,
        role: "user",
        passwordHash: hashPassword(input.password),
      });

      // Mark invite used
      await db.update(invites).set({ usedBy: uid, usedAt: new Date() }).where(eq(invites.id, inv.id));

      // Create session
      const sid = crypto.randomUUID();
      const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(sessions).values({ id: sid, userId: uid, expiresAt: exp });

      ctx.setCookies.push(makeSessionCookie(sid, exp));
      return { ok: true as const };
    }),

  // Optional: login by email + password (handy later)
  loginWithPassword: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const [u] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      if (!u || !verifyPassword(input.password, u.passwordHash ?? null)) {
        return { ok: false as const, error: "Invalid credentials" };
      }
      const sid = crypto.randomUUID();
      const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(sessions).values({ id: sid, userId: u.id, expiresAt: exp });
      ctx.setCookies.push(makeSessionCookie(sid, exp));
      return { ok: true as const };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    const sid = ctx.sid;
    if (sid) {
      await db.delete(sessions).where(eq(sessions.id, sid));
    }
    ctx.setCookies.push(`sid=; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(0).toUTCString()}`);
    return { ok: true as const };
  }),
});
