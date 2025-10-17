// src/server/trpc/routers/stats.ts
import { z } from "zod";
import { router, publicProcedure } from "../index";
import { db } from "../../db/client";
import { drops } from "../../db/schema";
import { sql } from "drizzle-orm";

export const statsRouter = router({
  // Per-drop stats for a recent window (e.g., last 60 minutes)
  forDrop: publicProcedure.input(
    z.object({ dropId: z.string(), windowMinutes: z.number().int().min(1).max(24*60).default(60) })
  ).query(async ({ input }) => {
    const { dropId, windowMinutes } = input;

    // 1) Pull base fields
    const [d] = await db.execute(sql`
      SELECT id, created_at, first_viewed_at, exhausted_at, max_views, used_views
      FROM drops WHERE id = ${dropId} LIMIT 1
    `);

    // 2) Clicks per minute over the window (zero-filled)
    const buckets = await db.execute(sql`
      WITH series AS (
        SELECT generate_series(
          date_trunc('minute', now() - interval '${windowMinutes} minutes'),
          date_trunc('minute', now()),
          interval '1 minute'
        ) AS bucket
      ),
      counts AS (
        SELECT date_trunc('minute', viewed_at) AS bucket, count(*)::int AS c
        FROM views
        WHERE drop_id = ${dropId}
          AND viewed_at >= now() - interval '${windowMinutes} minutes'
        GROUP BY 1
      )
      SELECT series.bucket, COALESCE(counts.c, 0) AS count
      FROM series
      LEFT JOIN counts ON series.bucket = counts.bucket
      ORDER BY series.bucket ASC
    `);

    // 3) Unique IPs in window (optional)
    const uniqueIps = await db.execute(sql`
      SELECT COUNT(DISTINCT ip) AS n FROM views
      WHERE drop_id = ${dropId}
        AND viewed_at >= now() - interval '${windowMinutes} minutes'
        AND ip IS NOT NULL
    `);

    // 4) Derived metrics
    const createdAt = d?.created_at as Date | null;
    const firstViewedAt = d?.first_viewed_at as Date | null;
    const exhaustedAt = d?.exhausted_at as Date | null;

    const timeToFirstSec = createdAt && firstViewedAt ? Math.round((+firstViewedAt - +createdAt)/1000) : null;
    const timeToExhaustSec = createdAt && exhaustedAt ? Math.round((+exhaustedAt - +createdAt)/1000) : null;

    const perMin = (buckets as any[]).map(b => ({ t: b.bucket, c: Number(b.count) }));
    const peakRPM = perMin.reduce((m, x) => Math.max(m, x.c), 0);
    const totalInWindow = perMin.reduce((s, x) => s + x.c, 0);

    return {
      dropId,
      createdAt,
      firstViewedAt,
      exhaustedAt,
      maxViews: d?.max_views ?? 0,
      usedViews: d?.used_views ?? 0,
      timeToFirstSec,
      timeToExhaustSec,
      peakRPM,
      totalInWindow,
      uniqueIps: Number((uniqueIps as any[])[0]?.n ?? 0),
      perMinute: perMin, // array of { t: Date, c: number }
    };
  }),

  // Overview: fast counts across all drops in window
  overview: publicProcedure.input(
    z.object({ windowMinutes: z.number().int().min(1).max(24*60).default(60) })
  ).query(async ({ input }) => {
    const { windowMinutes } = input;
    const [row] = await db.execute(sql`
      SELECT
        COUNT(*)::int AS totalDrops,
        SUM(CASE WHEN exhausted_at IS NOT NULL THEN 1 ELSE 0 END)::int AS exhaustedDrops,
        SUM(used_views)::int AS totalViews
      FROM drops
      WHERE created_at >= now() - interval '${windowMinutes} minutes'
    `);
    return row;
  }),
});
