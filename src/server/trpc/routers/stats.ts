import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, sql, and, gte, desc, count, inArray } from "drizzle-orm";
import { router, protectedProcedure } from "../index";
import { drops, views } from "@/server/db/schema";
import type { Context } from "../context";

const MAX_WINDOW_MINUTES = 7 * 24 * 60; // 7 days
const DEFAULT_WINDOW_MINUTES = 60;

const forDropSchema = z.object({
  dropId: z.string().uuid(),
  windowMinutes: z.number().int().min(1).max(MAX_WINDOW_MINUTES).default(DEFAULT_WINDOW_MINUTES),
});

async function assertDropAccess(
  ctx: Context & { user: NonNullable<Context["user"]> },
  dropId: string,
) {
  const [drop] = await ctx.db
    .select({
      id: drops.id,
      ownerId: drops.ownerId,
      createdAt: drops.createdAt,
      firstViewedAt: drops.firstViewedAt,
      exhaustedAt: drops.exhaustedAt,
      maxViews: drops.maxViews,
      usedViews: drops.usedViews,
    })
    .from(drops)
    .where(eq(drops.id, dropId))
    .limit(1);

  if (!drop) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Drop not found" });
  }
  const isPrivileged = ctx.user.role === "owner" || ctx.user.role === "admin";
  if (!isPrivileged && drop.ownerId !== ctx.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only view stats for your own drops",
    });
  }
  return drop;
}

export const statsRouter = router({
  forDrop: protectedProcedure.input(forDropSchema).query(async ({ input, ctx }) => {
    const { dropId, windowMinutes } = input;
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    const drop = await assertDropAccess(ctx, dropId);

    const viewsInWindow = await ctx.db
      .select({ viewedAt: views.viewedAt, ip: views.ip })
      .from(views)
      .where(and(eq(views.dropId, dropId), gte(views.viewedAt, windowStart)))
      .orderBy(desc(views.viewedAt));

    // Per-minute buckets + unique (truncated) networks.
    const bucketMap = new Map<string, number>();
    const uniqueNetworks = new Set<string>();
    for (const view of viewsInWindow) {
      const bucketKey = new Date(view.viewedAt).toISOString().slice(0, 16);
      bucketMap.set(bucketKey, (bucketMap.get(bucketKey) ?? 0) + 1);
      if (view.ip) uniqueNetworks.add(view.ip);
    }

    const perMinute = Array.from(bucketMap.entries())
      .map(([t, c]) => ({ t: new Date(t + ":00.000Z"), c }))
      .sort((a, b) => a.t.getTime() - b.t.getTime());

    const timeToFirstSec =
      drop.createdAt && drop.firstViewedAt
        ? Math.round((drop.firstViewedAt.getTime() - drop.createdAt.getTime()) / 1000)
        : null;
    const timeToExhaustSec =
      drop.createdAt && drop.exhaustedAt
        ? Math.round((drop.exhaustedAt.getTime() - drop.createdAt.getTime()) / 1000)
        : null;

    return {
      dropId,
      createdAt: drop.createdAt,
      firstViewedAt: drop.firstViewedAt,
      exhaustedAt: drop.exhaustedAt,
      maxViews: drop.maxViews,
      usedViews: drop.usedViews,
      timeToFirstSec,
      timeToExhaustSec,
      peakRPM: perMinute.reduce((max, x) => Math.max(max, x.c), 0),
      totalInWindow: viewsInWindow.length,
      uniqueNetworks: uniqueNetworks.size,
      perMinute,
    };
  }),

  overview: protectedProcedure
    .input(
      z.object({
        windowMinutes: z
          .number()
          .int()
          .min(1)
          .max(MAX_WINDOW_MINUTES)
          .default(24 * 60),
      }),
    )
    .query(async ({ input, ctx }) => {
      const windowStart = new Date(Date.now() - input.windowMinutes * 60 * 1000);
      const isPrivileged = ctx.user.role === "owner" || ctx.user.role === "admin";
      const ownDrops = isPrivileged ? undefined : eq(drops.ownerId, ctx.user.id);

      const [dropStats] = await ctx.db
        .select({
          totalDrops: count(),
          exhaustedDrops: sql<number>`SUM(CASE WHEN ${drops.exhaustedAt} IS NOT NULL THEN 1 ELSE 0 END)::int`,
          totalViews: sql<number>`COALESCE(SUM(${drops.usedViews}), 0)::int`,
          activeDrops: sql<number>`SUM(CASE WHEN ${drops.revokedAt} IS NULL AND ${drops.expiresAt} > NOW() AND ${drops.usedViews} < ${drops.maxViews} THEN 1 ELSE 0 END)::int`,
        })
        .from(drops)
        .where(ownDrops);

      // Views in window, scoped to drops this user can see.
      const visibleViews = isPrivileged
        ? gte(views.viewedAt, windowStart)
        : and(
            gte(views.viewedAt, windowStart),
            inArray(
              views.dropId,
              ctx.db.select({ id: drops.id }).from(drops).where(eq(drops.ownerId, ctx.user.id)),
            ),
          );

      const [viewStats] = await ctx.db.select({ n: count() }).from(views).where(visibleViews);

      return {
        totalDrops: dropStats?.totalDrops ?? 0,
        exhaustedDrops: dropStats?.exhaustedDrops ?? 0,
        activeDrops: dropStats?.activeDrops ?? 0,
        totalLifetimeViews: dropStats?.totalViews ?? 0,
        viewsInWindow: viewStats?.n ?? 0,
        windowMinutes: input.windowMinutes,
      };
    }),

  recentViews: protectedProcedure
    .input(
      z.object({
        dropId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ input, ctx }) => {
      await assertDropAccess(ctx, input.dropId);

      const recent = await ctx.db
        .select({ id: views.id, viewedAt: views.viewedAt, ua: views.ua, ip: views.ip })
        .from(views)
        .where(eq(views.dropId, input.dropId))
        .orderBy(desc(views.viewedAt))
        .limit(input.limit);

      return { views: recent };
    }),
});
