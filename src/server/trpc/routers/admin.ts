import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNull, sql, count } from "drizzle-orm";
import { router, adminProcedure, ownerProcedure } from "../index";
import { users, sessions, invites, drops } from "@/server/db/schema";
import { runPurge } from "@/server/purge";

export const adminRouter = router({
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();

    const userRows = await ctx.db
      .select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(users.createdAt);

    const dropCounts = await ctx.db
      .select({ ownerId: drops.ownerId, n: count() })
      .from(drops)
      .groupBy(drops.ownerId);

    const sessionCounts = await ctx.db
      .select({ userId: sessions.userId, n: count() })
      .from(sessions)
      .where(gt(sessions.expiresAt, now))
      .groupBy(sessions.userId);

    const dropsBy = new Map(dropCounts.map((r) => [r.ownerId, r.n]));
    const sessionsBy = new Map(sessionCounts.map((r) => [r.userId, r.n]));

    return userRows.map((u) => ({
      ...u,
      dropCount: dropsBy.get(u.id) ?? 0,
      activeSessions: sessionsBy.get(u.id) ?? 0,
    }));
  }),

  setRole: ownerProcedure
    .input(z.object({ userId: z.string().uuid(), role: z.enum(["admin", "user"]) }))
    .mutation(async ({ input, ctx }) => {
      const [target] = await ctx.db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (target.role === "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "The owner role cannot be changed" });
      }

      await ctx.db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      return { ok: true as const };
    }),

  revokeUserSessions: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [target] = await ctx.db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (target.role === "owner" && ctx.user.role !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admins cannot sign out the owner" });
      }

      await ctx.db.delete(sessions).where(eq(sessions.userId, input.userId));
      return { ok: true as const };
    }),

  deleteUser: ownerProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [target] = await ctx.db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      if (target.role === "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "The owner account cannot be deleted" });
      }

      await ctx.db.transaction(async (tx) => {
        await tx.delete(sessions).where(eq(sessions.userId, input.userId));
        // Invites reference their creator; reassign to the acting owner so
        // the FK holds but the account can go.
        await tx
          .update(invites)
          .set({ createdBy: ctx.user.id })
          .where(eq(invites.createdBy, input.userId));
        await tx.delete(users).where(eq(users.id, input.userId));
      });
      // The user's drops are kept (ownerId is a soft reference) so shared
      // links keep working until they expire; admins still see them.
      return { ok: true as const };
    }),

  listInvites: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const rows = await ctx.db
      .select({
        id: invites.id,
        createdAt: invites.createdAt,
        expiresAt: invites.expiresAt,
        createdByName: users.displayName,
      })
      .from(invites)
      .leftJoin(users, eq(invites.createdBy, users.id))
      .where(and(isNull(invites.usedAt), gt(invites.expiresAt, now)))
      .orderBy(desc(invites.createdAt));
    return rows;
  }),

  revokeInvite: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.db
        .update(invites)
        .set({ expiresAt: new Date() })
        .where(and(eq(invites.id, input.id), isNull(invites.usedAt)))
        .returning({ id: invites.id });
      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found or already used" });
      }
      return { ok: true as const };
    }),

  /** Run the retention sweep immediately. */
  purgeNow: adminProcedure.mutation(async ({ ctx }) => {
    return await runPurge(ctx.db);
  }),

  overview: adminProcedure.query(async ({ ctx }) => {
    const [userCount] = await ctx.db.select({ n: count() }).from(users);
    const [dropCount] = await ctx.db.select({ n: count() }).from(drops);
    const [purgedCount] = await ctx.db
      .select({ n: count() })
      .from(drops)
      .where(sql`${drops.purgedAt} IS NOT NULL`);
    const [sessionCount] = await ctx.db
      .select({ n: count() })
      .from(sessions)
      .where(gt(sessions.expiresAt, new Date()));

    return {
      users: userCount?.n ?? 0,
      drops: dropCount?.n ?? 0,
      purgedDrops: purgedCount?.n ?? 0,
      activeSessions: sessionCount?.n ?? 0,
    };
  }),
});
