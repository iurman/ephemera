import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, adminProcedure } from "../index";
import { db } from "../../db/client";
import { users, sessions, invites } from "../../db/schema";
import { and, eq, isNull, gt } from "drizzle-orm";
import crypto from "crypto";

// Constants
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MIN_PASSWORD_LENGTH = 6;
const SCRYPT_KEY_LENGTH = 64;

// Helper functions
function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function makeSessionCookie(id: string, exp: Date): string {
  const parts = [
    `sid=${encodeURIComponent(id)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${exp.toUTCString()}`,
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function clearSessionCookie(): string {
  return `sid=; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(0).toUTCString()}`;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const buf = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `${salt}:${buf.toString("hex")}`;
}

function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const hash = Buffer.from(hex, "hex");
  const test = crypto.scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return crypto.timingSafeEqual(hash, test);
}

async function createSession(userId: string, ctx: { setCookies: string[] }): Promise<void> {
  const sid = crypto.randomUUID();
  const exp = new Date(Date.now() + SESSION_DURATION_MS);
  await db.insert(sessions).values({ id: sid, userId, expiresAt: exp });
  ctx.setCookies.push(makeSessionCookie(sid, exp));
}

// Input schemas
const bootstrapOwnerSchema = z.object({
  displayName: z.string().min(1, "Display name is required").max(100),
});

const createInviteSchema = z.object({
  expiresMinutes: z.number().int().min(1).max(7 * 24 * 60).default(60),
});

const consumeInviteSchema = z.object({
  token: z.string().min(1),
  displayName: z.string().min(1, "Display name is required").max(100),
  email: z.string().email().optional(),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authRouter = router({
  // Get current user
  me: publicProcedure.query(async ({ ctx }) => ctx.user),

  // Bootstrap the first owner account (only works on fresh database)
  bootstrapOwner: publicProcedure
    .input(bootstrapOwnerSchema)
    .mutation(async ({ input, ctx }) => {
      const existing = await db.select({ id: users.id }).from(users).limit(1);
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An owner account already exists",
        });
      }

      const uid = crypto.randomUUID();
      await db.insert(users).values({
        id: uid,
        displayName: input.displayName,
        role: "owner",
      });

      await createSession(uid, ctx);
      return { ok: true as const };
    }),

  // Create an invite (admin/owner only)
  createInvite: adminProcedure
    .input(createInviteSchema)
    .mutation(async ({ ctx, input }) => {
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

  // Sign up using invite
  consumeInvite: publicProcedure
    .input(consumeInviteSchema)
    .mutation(async ({ input, ctx }) => {
      const tokenHash = hashToken(input.token);
      const now = new Date();

      const [inv] = await db
        .select()
        .from(invites)
        .where(
          and(
            eq(invites.tokenHash, tokenHash),
            isNull(invites.usedAt),
            gt(invites.expiresAt, now)
          )
        )
        .limit(1);

      if (!inv) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or expired invite",
        });
      }

      // Check if email is already taken
      if (input.email) {
        const [existingUser] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);

        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email already exists",
          });
        }
      }

      // Create user
      const uid = crypto.randomUUID();
      await db.insert(users).values({
        id: uid,
        displayName: input.displayName,
        email: input.email ?? null,
        role: "user",
        passwordHash: hashPassword(input.password),
      });

      // Mark invite as used
      await db
        .update(invites)
        .set({ usedBy: uid, usedAt: now })
        .where(eq(invites.id, inv.id));

      await createSession(uid, ctx);
      return { ok: true as const };
    }),

  // Login with email and password
  loginWithPassword: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input, ctx }) => {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (!user || !verifyPassword(input.password, user.passwordHash ?? null)) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }

      await createSession(user.id, ctx);
      return { ok: true as const };
    }),

  // Logout
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const sid = ctx.sid;
    if (sid) {
      await db.delete(sessions).where(eq(sessions.id, sid));
    }
    ctx.setCookies.push(clearSessionCookie());
    return { ok: true as const };
  }),
});
