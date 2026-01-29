import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../index";
import { db } from "../../db/client";
import { drops, views } from "../../db/schema";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import crypto from "crypto";
import type { DropKind } from "@/lib/types";

// Constants
const TOKEN_LENGTH = 16;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

// Generate a secure random token
const generateToken = (): string =>
  crypto.randomBytes(TOKEN_LENGTH / 2).toString("hex");

// Input schemas
const createDropSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  body: z.string().min(1, "Body is required").max(50000, "Body too long"),
  ttlMs: z.number().int().positive().max(30 * 24 * 60 * 60 * 1000), // Max 30 days
  maxViews: z.number().int().min(1).max(1000),
  kind: z.enum(["text", "url"]).default("text"),
});

const listDropsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  filter: z.enum(["all", "active", "expired", "exhausted", "revoked"]).default("all"),
});

const consumeDropSchema = z.object({
  token: z.string().min(1),
  ua: z.string().max(500).optional(),
  ip: z.string().max(45).optional(), // IPv6 max length
});

export const dropRouter = router({
  // Create a new drop
  create: protectedProcedure
    .input(createDropSchema)
    .mutation(async ({ input, ctx }) => {
      // Validate URL if kind is "url"
      if (input.kind === "url") {
        try {
          new URL(input.body);
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid URL format",
          });
        }
      }

      const id = crypto.randomUUID();
      const token = generateToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + input.ttlMs);

      await db.insert(drops).values({
        id,
        token,
        ownerId: ctx.user.id,
        kind: input.kind,
        title: input.title,
        body: input.body,
        ttlMs: input.ttlMs,
        maxViews: input.maxViews,
        usedViews: 0,
        createdAt: now,
        expiresAt,
        firstViewedAt: null,
        lastViewedAt: null,
        exhaustedAt: null,
        revokedAt: null,
      });

      return { token, url: `/d/${token}` };
    }),

  // List drops with pagination
  list: protectedProcedure
    .input(listDropsSchema.optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
      const cursor = input?.cursor;
      const filter = input?.filter ?? "all";
      const now = new Date();

      // Build base conditions based on user role
      const isAdminOrOwner = ctx.user.role === "owner" || ctx.user.role === "admin";
      const baseConditions = isAdminOrOwner
        ? []
        : [eq(drops.ownerId, ctx.user.id)];

      // Add filter conditions
      const filterConditions = (() => {
        switch (filter) {
          case "active":
            return [
              isNull(drops.revokedAt),
              gt(drops.expiresAt, now),
              sql`${drops.usedViews} < ${drops.maxViews}`,
            ];
          case "expired":
            return [isNull(drops.revokedAt), lt(drops.expiresAt, now)];
          case "exhausted":
            return [
              isNull(drops.revokedAt),
              sql`${drops.usedViews} >= ${drops.maxViews}`,
            ];
          case "revoked":
            return [sql`${drops.revokedAt} IS NOT NULL`];
          default:
            return [];
        }
      })();

      // Add cursor condition for pagination
      const cursorCondition = cursor
        ? [lt(drops.createdAt, new Date(cursor))]
        : [];

      const allConditions = [...baseConditions, ...filterConditions, ...cursorCondition];

      const items = await db
        .select({
          id: drops.id,
          token: drops.token,
          title: drops.title,
          kind: drops.kind,
          maxViews: drops.maxViews,
          usedViews: drops.usedViews,
          expiresAt: drops.expiresAt,
          revokedAt: drops.revokedAt,
          firstViewedAt: drops.firstViewedAt,
          lastViewedAt: drops.lastViewedAt,
          exhaustedAt: drops.exhaustedAt,
          createdAt: drops.createdAt,
          ownerId: drops.ownerId,
        })
        .from(drops)
        .where(allConditions.length > 0 ? and(...allConditions) : undefined)
        .orderBy(desc(drops.createdAt))
        .limit(limit + 1); // Fetch one extra to check if there's more

      const hasMore = items.length > limit;
      const returnItems = hasMore ? items.slice(0, -1) : items;
      const nextCursor = hasMore && returnItems.length > 0
        ? returnItems[returnItems.length - 1].createdAt.toISOString()
        : null;

      return {
        items: returnItems.map((item) => ({
          ...item,
          kind: item.kind as DropKind,
        })),
        nextCursor,
        hasMore,
      };
    }),

  // Revoke a drop
  revoke: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Check ownership unless admin/owner
      if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
        const [drop] = await db
          .select({ ownerId: drops.ownerId })
          .from(drops)
          .where(eq(drops.id, input.id))
          .limit(1);

        if (!drop || drop.ownerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only revoke your own drops",
          });
        }
      }

      const result = await db
        .update(drops)
        .set({ revokedAt: new Date() })
        .where(and(eq(drops.id, input.id), isNull(drops.revokedAt)))
        .returning({ id: drops.id });

      if (result.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Drop not found or already revoked",
        });
      }

      return { ok: true as const };
    }),

  // Consume a drop (public - no auth required)
  consume: publicProcedure
    .input(consumeDropSchema)
    .mutation(async ({ input }) => {
      const now = new Date();

      return await db.transaction(async (tx) => {
        // Atomic update: increment views if valid
        const updated = await tx
          .update(drops)
          .set({
            usedViews: sql`${drops.usedViews} + 1`,
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
              or(isNull(drops.expiresAt), gt(drops.expiresAt, now)),
              sql`${drops.usedViews} < ${drops.maxViews}`
            )
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
          ua: input.ua?.slice(0, 500) ?? null,
          ip: input.ip?.slice(0, 45) ?? null,
        });

        const remaining = Math.max(0, row.maxViews - row.usedViews);
        const expiresInMs = row.expiresAt
          ? Math.max(0, row.expiresAt.getTime() - now.getTime())
          : undefined;

        return {
          ok: true as const,
          title: row.title,
          body: row.body,
          remaining,
          kind: row.kind as DropKind,
          url: row.kind === "url" ? row.body : undefined,
          expiresInMs,
        };
      });
    }),

  // Get a single drop by ID (for stats page)
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const [drop] = await db
        .select()
        .from(drops)
        .where(eq(drops.id, input.id))
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
          message: "You can only view your own drops",
        });
      }

      return {
        ...drop,
        kind: drop.kind as DropKind,
      };
    }),
});
