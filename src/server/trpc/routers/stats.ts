import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../index";
import { db } from "../../db/client";
import { drops, views } from "../../db/schema";
import { eq, sql, and, gte, desc, count } from "drizzle-orm";

// Constants
const MAX_WINDOW_MINUTES = 24 * 60; // 24 hours
const DEFAULT_WINDOW_MINUTES = 60;

// Input schemas
const forDropSchema = z.object({
  dropId: z.string().uuid(),
  windowMinutes: z.number().int().min(1).max(MAX_WINDOW_MINUTES).default(DEFAULT_WINDOW_MINUTES),
});

const overviewSchema = z.object({
  windowMinutes: z.number().int().min(1).max(MAX_WINDOW_MINUTES).default(DEFAULT_WINDOW_MINUTES),
});

export const statsRouter = router({
  // Get detailed stats for a specific drop
  forDrop: protectedProcedure
    .input(forDropSchema)
    .query(async ({ input, ctx }) => {
      const { dropId, windowMinutes } = input;
      const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

      // Fetch drop details with access check
      const [drop] = await db
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
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Drop not found",
        });
      }

      // Check access
      const isAdminOrOwner = ctx.user.role === "owner" || ctx.user.role === "admin";
      if (!isAdminOrOwner && drop.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only view stats for your own drops",
        });
      }

      // Get views in the time window
      const viewsInWindow = await db
        .select({
          viewedAt: views.viewedAt,
          ip: views.ip,
        })
        .from(views)
        .where(
          and(
            eq(views.dropId, dropId),
            gte(views.viewedAt, windowStart)
          )
        )
        .orderBy(desc(views.viewedAt));

      // Calculate per-minute buckets
      const bucketMap = new Map<string, number>();
      const uniqueIps = new Set<string>();

      for (const view of viewsInWindow) {
        // Per-minute bucket
        const bucketKey = new Date(view.viewedAt)
          .toISOString()
          .slice(0, 16); // YYYY-MM-DDTHH:MM
        bucketMap.set(bucketKey, (bucketMap.get(bucketKey) ?? 0) + 1);

        // Unique IPs
        if (view.ip) {
          uniqueIps.add(view.ip);
        }
      }

      // Convert to array sorted by time
      const perMinute = Array.from(bucketMap.entries())
        .map(([t, c]) => ({ t: new Date(t), c }))
        .sort((a, b) => a.t.getTime() - b.t.getTime());

      // Calculate derived metrics
      const peakRPM = perMinute.reduce((max, x) => Math.max(max, x.c), 0);
      const totalInWindow = viewsInWindow.length;

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
        peakRPM,
        totalInWindow,
        uniqueIps: uniqueIps.size,
        perMinute,
      };
    }),

  // Get overview stats across all drops
  overview: protectedProcedure
    .input(overviewSchema)
    .query(async ({ input, ctx }) => {
      const { windowMinutes } = input;
      const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

      // Build conditions based on user role
      const isAdminOrOwner = ctx.user.role === "owner" || ctx.user.role === "admin";

      // Get aggregated stats
      const baseCondition = gte(drops.createdAt, windowStart);
      const userCondition = isAdminOrOwner ? undefined : eq(drops.ownerId, ctx.user.id);
      const whereClause = userCondition ? and(baseCondition, userCondition) : baseCondition;

      const [stats] = await db
        .select({
          totalDrops: count(),
          exhaustedDrops: sql<number>`SUM(CASE WHEN ${drops.exhaustedAt} IS NOT NULL THEN 1 ELSE 0 END)::int`,
          totalViews: sql<number>`SUM(${drops.usedViews})::int`,
          activeDrops: sql<number>`SUM(CASE WHEN ${drops.revokedAt} IS NULL AND ${drops.expiresAt} > NOW() AND ${drops.usedViews} < ${drops.maxViews} THEN 1 ELSE 0 END)::int`,
        })
        .from(drops)
        .where(whereClause);

      // Get recent views count in window
      const [viewStats] = await db
        .select({
          totalViews: count(),
        })
        .from(views)
        .where(gte(views.viewedAt, windowStart));

      return {
        totalDrops: stats?.totalDrops ?? 0,
        exhaustedDrops: stats?.exhaustedDrops ?? 0,
        activeDrops: stats?.activeDrops ?? 0,
        totalLifetimeViews: stats?.totalViews ?? 0,
        viewsInWindow: viewStats?.totalViews ?? 0,
        windowMinutes,
      };
    }),

  // Get recent views for a drop (for live feed)
  recentViews: protectedProcedure
    .input(z.object({
      dropId: z.string().uuid(),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const { dropId, limit } = input;

      // Check access
      const [drop] = await db
        .select({ ownerId: drops.ownerId })
        .from(drops)
        .where(eq(drops.id, dropId))
        .limit(1);

      if (!drop) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Drop not found",
        });
      }

      const isAdminOrOwner = ctx.user.role === "owner" || ctx.user.role === "admin";
      if (!isAdminOrOwner && drop.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only view stats for your own drops",
        });
      }

      const recentViews = await db
        .select({
          id: views.id,
          viewedAt: views.viewedAt,
          ua: views.ua,
          ip: views.ip,
        })
        .from(views)
        .where(eq(views.dropId, dropId))
        .orderBy(desc(views.viewedAt))
        .limit(limit);

      return { views: recentViews };
    }),
});
