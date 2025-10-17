import { z } from "zod";
import { router, publicProcedure } from "../index";
import { db } from "../../db/client";
import { drops, views } from "../../db/schema";
import {
  and,
  desc,
  eq,
  gt,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import crypto from "crypto";

const newToken = () =>
  Math.random().toString(36).slice(2, 10) +
  Math.random().toString(36).slice(2, 10);

export const dropRouter = router({
  create: publicProcedure
    .input(
      z.object({
        title: z.string().min(1),
        body: z.string().min(1),
        ttlMs: z.number().int().positive(),
        maxViews: z.number().int().min(1).max(100),
        kind: z.enum(["text", "url"]).default("text"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const id = crypto.randomUUID();
      const token = newToken();
      const now = Date.now();

      await db.insert(drops).values({
        id,
        token,
        ownerId: ctx.user?.id ?? null,
        kind: input.kind,
        title: input.title,
        body: input.body,
        ttlMs: input.ttlMs,
        maxViews: input.maxViews,
        usedViews: 0,
        createdAt: new Date(), // if your schema has this
        expiresAt: new Date(now + input.ttlMs),
        firstViewedAt: null,
        lastViewedAt: null,
        exhaustedAt: null,
        revokedAt: null,
      } as any);

      return { token, url: `/d/${token}` };
    }),

  list: publicProcedure.query(async ({ ctx }) => {
    if (ctx.user && (ctx.user.role === "owner" || ctx.user.role === "admin")) {
      const items = await db.select().from(drops).orderBy(desc(drops.createdAt));
      return { items };
    }
    if (ctx.user) {
      const items = await db
        .select()
        .from(drops)
        .where(eq(drops.ownerId, ctx.user.id))
        .orderBy(desc(drops.createdAt));
      return { items };
    }
    return { items: [] };
  }),

  revoke: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) return { ok: false as const, error: "Unauthorized" };
      await db
        .update(drops)
        .set({ revokedAt: new Date() })
        .where(eq(drops.id, input.id));
      return { ok: true as const };
    }),

  // Atomic consume: single UPDATE ... RETURNING guarded by WHERE,
  // then insert a views row in the same tx.
  consume: publicProcedure
    .input(
      z.object({
        token: z.string(),
        ua: z.string().optional(),
        ip: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const now = new Date();

      return await db.transaction(async (tx) => {
        // Attempt to increment if token is valid, not revoked, not expired, and not exhausted.
        const updated = await tx
          .update(drops)
          .set({
            usedViews: sql`${drops.usedViews} + 1`,
            // Set firstViewedAt only if it was null before
            firstViewedAt: sql`COALESCE(${drops.firstViewedAt}, ${now})`,
            lastViewedAt: now,
            exhaustedAt: sql`CASE
              WHEN ${drops.usedViews} + 1 >= ${drops.maxViews}
              THEN COALESCE(${drops.exhaustedAt}, ${now})
              ELSE ${drops.exhaustedAt}
            END`,
          })
          .where(
            and(
              eq(drops.token, input.token),
              isNull(drops.revokedAt),
              // not expired: expiresAt is null OR now < expiresAt
              or(isNull(drops.expiresAt), gt(drops.expiresAt, now)),
              // not exhausted *before* this view
              sql`${drops.usedViews} < ${drops.maxViews}`,
            ),
          )
          .returning({
            id: drops.id,
            title: drops.title,
            body: drops.body,
            usedViews: drops.usedViews,
            maxViews: drops.maxViews,
            kind: drops.kind,
            expiresAt: drops.expiresAt,
          });

        const row = updated[0];
        if (!row) {
          return { ok: false as const, error: "Link invalid or expired" };
        }

        // Log the view
        await tx.insert(views).values({
          id: crypto.randomUUID(),
          dropId: row.id,
          viewedAt: now,
          ua: input.ua ?? null,
          ip: input.ip ?? null,
        } as any);

        const remaining =
          row.maxViews != null
            ? Number(row.maxViews) - Number(row.usedViews)
            : undefined;

        const expiresInMs =
          row.expiresAt != null ? Math.max(0, row.expiresAt.getTime() - now.getTime()) : undefined;

        return {
          ok: true as const,
          title: row.title ?? null,
          body: row.body ?? null,
          remaining,
          kind: row.kind as "text" | "url",
          url: row.kind === "url" ? row.body ?? undefined : undefined,
          expiresInMs,
        };
      });
    }),
});
