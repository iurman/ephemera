import { z } from "zod";
import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, gt } from "drizzle-orm";
import { router, publicProcedure, adminProcedure, protectedProcedure, rateLimit } from "../index";
import { users, sessions, invites } from "@/server/db/schema";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, clearSessionCookie } from "@/server/auth/session";

const MIN_PASSWORD_LENGTH = 8;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(200);

const bootstrapOwnerSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required").max(100),
  email: z.email("A valid email is required"),
  password: passwordSchema,
});

const createInviteSchema = z.object({
  expiresMinutes: z
    .number()
    .int()
    .min(1)
    .max(7 * 24 * 60)
    .default(60),
});

const consumeInviteSchema = z.object({
  token: z.string().min(1),
  displayName: z.string().trim().min(1, "Display name is required").max(100),
  email: z.email("A valid email is required"),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});

export const authRouter = router({
  me: publicProcedure.query(async ({ ctx }) => ctx.user),

  /** Whether this instance has any accounts yet (drives first-run UI). */
  status: publicProcedure.query(async ({ ctx }) => {
    const existing = await ctx.db.select({ id: users.id }).from(users).limit(1);
    return { hasUsers: existing.length > 0 };
  }),

  /**
   * First-run setup. Creates the owner account with real credentials so the
   * owner can always log back in.
   */
  bootstrapOwner: publicProcedure
    .use(rateLimit("auth.bootstrap", 10, 60_000))
    .input(bootstrapOwnerSchema)
    .mutation(async ({ input, ctx }) => {
      const existing = await ctx.db.select({ id: users.id }).from(users).limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "An owner account already exists" });
      }

      const uid = crypto.randomUUID();
      await ctx.db.insert(users).values({
        id: uid,
        displayName: input.displayName,
        email: input.email,
        role: "owner",
        passwordHash: await hashPassword(input.password),
      });

      await createSession(ctx.db, uid, ctx.setCookies);
      return { ok: true as const };
    }),

  createInvite: adminProcedure.input(createInviteSchema).mutation(async ({ ctx, input }) => {
    const raw = crypto.randomBytes(24).toString("base64url");
    await ctx.db.insert(invites).values({
      id: crypto.randomUUID(),
      tokenHash: hashToken(raw),
      createdBy: ctx.user.id,
      expiresAt: new Date(Date.now() + input.expiresMinutes * 60 * 1000),
      maxUses: 1,
    });
    return { ok: true as const, url: `/signup?token=${raw}` };
  }),

  consumeInvite: publicProcedure
    .use(rateLimit("auth.signup", 10, 60_000))
    .input(consumeInviteSchema)
    .mutation(async ({ input, ctx }) => {
      const tokenHash = hashToken(input.token);
      const now = new Date();

      const [inv] = await ctx.db
        .select()
        .from(invites)
        .where(
          and(eq(invites.tokenHash, tokenHash), isNull(invites.usedAt), gt(invites.expiresAt, now)),
        )
        .limit(1);

      if (!inv) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired invite" });
      }

      const [existingUser] = await ctx.db
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

      const uid = crypto.randomUUID();
      await ctx.db.insert(users).values({
        id: uid,
        displayName: input.displayName,
        email: input.email,
        role: "user",
        passwordHash: await hashPassword(input.password),
      });

      await ctx.db
        .update(invites)
        .set({ usedBy: uid, usedAt: now })
        .where(eq(invites.id, inv.id));

      await createSession(ctx.db, uid, ctx.setCookies);
      return { ok: true as const };
    }),

  login: publicProcedure
    .use(rateLimit("auth.login", 10, 60_000))
    .input(loginSchema)
    .mutation(async ({ input, ctx }) => {
      const [user] = await ctx.db.select().from(users).where(eq(users.email, input.email)).limit(1);

      const valid = await verifyPassword(input.password, user?.passwordHash ?? null);
      if (!user || !valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      await createSession(ctx.db, user.id, ctx.setCookies);
      return { ok: true as const };
    }),

  changePassword: protectedProcedure
    .use(rateLimit("auth.changePassword", 10, 60_000))
    .input(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }))
    .mutation(async ({ input, ctx }) => {
      const [user] = await ctx.db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      const valid = await verifyPassword(input.currentPassword, user?.passwordHash ?? null);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      }

      await ctx.db
        .update(users)
        .set({ passwordHash: await hashPassword(input.newPassword) })
        .where(eq(users.id, ctx.user.id));

      return { ok: true as const };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.sid) {
      await ctx.db.delete(sessions).where(eq(sessions.id, ctx.sid));
    }
    ctx.setCookies.push(clearSessionCookie());
    return { ok: true as const };
  }),

  /** Sign out everywhere: delete all of this user's sessions. */
  logoutAll: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.delete(sessions).where(eq(sessions.userId, ctx.user.id));
    ctx.setCookies.push(clearSessionCookie());
    return { ok: true as const };
  }),
});
