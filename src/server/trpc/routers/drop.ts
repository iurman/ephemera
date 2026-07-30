import { z } from "zod";
import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNull, lt, isNotNull, sql } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure, rateLimit } from "../index";
import type { Database } from "@/server/db/client";
import { drops, views } from "@/server/db/schema";
import { truncateIp } from "@/server/security/rateLimit";
import type { DropKind } from "@/lib/types";

const TOKEN_BYTES = 16; // 128-bit URL token
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// ~1 MiB of binary content, base64-encoded inside an encrypted envelope,
// plus AES-GCM/base64 overhead.
const MAX_BODY_CHARS = 2_800_000;

const generateToken = () => crypto.randomBytes(TOKEN_BYTES).toString("hex");

const createDropSchema = z
  .object({
    title: z.string().trim().max(200, "Title too long").optional(),
    kind: z.enum(["text", "url", "file"]).default("text"),
    body: z.string().min(1, "Body is required").max(MAX_BODY_CHARS, "Content too large"),
    encVersion: z.union([z.literal(0), z.literal(1)]).default(1),
    iv: z.string().max(64).optional(),
    kdfSalt: z.string().max(64).optional(),
    passwordProtected: z.boolean().default(false),
    ttlMs: z.number().int().positive().max(MAX_TTL_MS),
    maxViews: z.number().int().min(1).max(1000),
  })
  .superRefine((input, ctx) => {
    if (input.encVersion === 1 && !input.iv) {
      ctx.addIssue({ code: "custom", message: "iv is required for encrypted drops" });
    }
    if (input.passwordProtected && (input.encVersion !== 1 || !input.kdfSalt)) {
      ctx.addIssue({
        code: "custom",
        message: "passphrase-protected drops must be encrypted and carry a kdfSalt",
      });
    }
    if (input.encVersion === 0 && input.kind === "url") {
      try {
        const url = new URL(input.body);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid URL format" });
      }
    }
    if (input.encVersion === 0 && input.kind === "file") {
      ctx.addIssue({ code: "custom", message: "File drops must be encrypted" });
    }
  });

const listDropsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  filter: z.enum(["all", "active", "expired", "exhausted", "revoked"]).default("all"),
});

/** Predicate for "this drop can still be consumed". */
function consumableWhere(token: string, now: Date) {
  return and(
    eq(drops.token, token),
    isNull(drops.revokedAt),
    gt(drops.expiresAt, now),
    sql`${drops.usedViews} < ${drops.maxViews}`,
  );
}

export const dropRouter = router({
  create: protectedProcedure
    .use(rateLimit("drop.create", 60, 60_000))
    .input(createDropSchema)
    .mutation(async ({ input, ctx }) => {
      const id = crypto.randomUUID();
      const token = generateToken();
      const now = new Date();

      await ctx.db.insert(drops).values({
        id,
        token,
        ownerId: ctx.user.id,
        kind: input.kind,
        title: input.title || "Untitled",
        body: input.body,
        encVersion: input.encVersion,
        iv: input.iv ?? null,
        kdfSalt: input.kdfSalt ?? null,
        passwordProtected: input.passwordProtected,
        ttlMs: input.ttlMs,
        maxViews: input.maxViews,
        usedViews: 0,
        createdAt: now,
        expiresAt: new Date(now.getTime() + input.ttlMs),
      });

      return { id, token, url: `/d/${token}` };
    }),

  list: protectedProcedure.input(listDropsSchema.optional()).query(async ({ ctx, input }) => {
    const limit = input?.limit ?? DEFAULT_PAGE_SIZE;
    const cursor = input?.cursor;
    const filter = input?.filter ?? "all";
    const now = new Date();

    const isPrivileged = ctx.user.role === "owner" || ctx.user.role === "admin";
    const baseConditions = isPrivileged ? [] : [eq(drops.ownerId, ctx.user.id)];

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
          return [isNull(drops.revokedAt), sql`${drops.usedViews} >= ${drops.maxViews}`];
        case "revoked":
          return [isNotNull(drops.revokedAt)];
        default:
          return [];
      }
    })();

    const cursorCondition = cursor ? [lt(drops.createdAt, new Date(cursor))] : [];
    const allConditions = [...baseConditions, ...filterConditions, ...cursorCondition];

    const items = await ctx.db
      .select({
        id: drops.id,
        token: drops.token,
        title: drops.title,
        kind: drops.kind,
        encVersion: drops.encVersion,
        passwordProtected: drops.passwordProtected,
        maxViews: drops.maxViews,
        usedViews: drops.usedViews,
        expiresAt: drops.expiresAt,
        revokedAt: drops.revokedAt,
        firstViewedAt: drops.firstViewedAt,
        lastViewedAt: drops.lastViewedAt,
        exhaustedAt: drops.exhaustedAt,
        purgedAt: drops.purgedAt,
        createdAt: drops.createdAt,
        ownerId: drops.ownerId,
      })
      .from(drops)
      .where(allConditions.length > 0 ? and(...allConditions) : undefined)
      .orderBy(desc(drops.createdAt))
      .limit(limit + 1);

    const hasMore = items.length > limit;
    const returnItems = hasMore ? items.slice(0, -1) : items;
    const nextCursor =
      hasMore && returnItems.length > 0
        ? returnItems[returnItems.length - 1].createdAt.toISOString()
        : null;

    return {
      items: returnItems.map((item) => ({ ...item, kind: item.kind as DropKind })),
      nextCursor,
      hasMore,
    };
  }),

  /**
   * Metadata for the reveal gate. Does NOT consume a view — this is what
   * makes link previews and prefetching bots harmless.
   */
  peek: publicProcedure
    .use(rateLimit("drop.peek", 120, 60_000))
    .input(z.object({ token: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) => {
      const now = new Date();
      const [row] = await ctx.db
        .select({
          kind: drops.kind,
          encVersion: drops.encVersion,
          passwordProtected: drops.passwordProtected,
          expiresAt: drops.expiresAt,
          maxViews: drops.maxViews,
          usedViews: drops.usedViews,
        })
        .from(drops)
        .where(consumableWhere(input.token, now))
        .limit(1);

      if (!row) return { available: false as const };

      return {
        available: true as const,
        kind: row.kind as DropKind,
        encVersion: row.encVersion,
        passwordProtected: row.passwordProtected,
        expiresAt: row.expiresAt,
        remaining: Math.max(0, row.maxViews - row.usedViews),
      };
    }),

  /**
   * Atomically consume one view and return the (possibly encrypted) payload.
   * Decryption happens client-side; the server never sees the key.
   */
  consume: publicProcedure
    .use(rateLimit("drop.consume", 30, 60_000))
    .input(z.object({ token: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date();

      return await ctx.db.transaction(async (tx) => {
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
          .where(consumableWhere(input.token, now))
          .returning({
            id: drops.id,
            title: drops.title,
            body: drops.body,
            encVersion: drops.encVersion,
            iv: drops.iv,
            kdfSalt: drops.kdfSalt,
            passwordProtected: drops.passwordProtected,
            usedViews: drops.usedViews,
            maxViews: drops.maxViews,
            kind: drops.kind,
            expiresAt: drops.expiresAt,
          });

        const row = updated[0];
        if (!row) {
          return { ok: false as const, error: "Link invalid or expired" };
        }

        await tx.insert(views).values({
          id: crypto.randomUUID(),
          dropId: row.id,
          viewedAt: now,
          ua: ctx.userAgent?.slice(0, 500) ?? null,
          ip: truncateIp(ctx.ip),
        });

        return {
          ok: true as const,
          title: row.title,
          body: row.body,
          encVersion: row.encVersion,
          iv: row.iv,
          kdfSalt: row.kdfSalt,
          passwordProtected: row.passwordProtected,
          kind: row.kind as DropKind,
          remaining: Math.max(0, row.maxViews - row.usedViews),
          expiresInMs: Math.max(0, row.expiresAt.getTime() - now.getTime()),
        };
      });
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      await assertCanManage(ctx, input.id);

      const result = await ctx.db
        .update(drops)
        .set({ revokedAt: new Date() })
        .where(and(eq(drops.id, input.id), isNull(drops.revokedAt)))
        .returning({ id: drops.id });

      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Drop not found or already revoked" });
      }
      return { ok: true as const };
    }),

  /** Hard delete a drop and its view log. */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      await assertCanManage(ctx, input.id);

      await ctx.db.transaction(async (tx) => {
        await tx.delete(views).where(eq(views.dropId, input.id));
        const deleted = await tx
          .delete(drops)
          .where(eq(drops.id, input.id))
          .returning({ id: drops.id });
        if (deleted.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Drop not found" });
        }
      });

      return { ok: true as const };
    }),

  /** Metadata for the detail page. Never returns the body. */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const [drop] = await ctx.db
        .select({
          id: drops.id,
          token: drops.token,
          ownerId: drops.ownerId,
          kind: drops.kind,
          title: drops.title,
          encVersion: drops.encVersion,
          passwordProtected: drops.passwordProtected,
          ttlMs: drops.ttlMs,
          maxViews: drops.maxViews,
          usedViews: drops.usedViews,
          createdAt: drops.createdAt,
          expiresAt: drops.expiresAt,
          revokedAt: drops.revokedAt,
          firstViewedAt: drops.firstViewedAt,
          lastViewedAt: drops.lastViewedAt,
          exhaustedAt: drops.exhaustedAt,
          purgedAt: drops.purgedAt,
        })
        .from(drops)
        .where(eq(drops.id, input.id))
        .limit(1);

      if (!drop) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Drop not found" });
      }

      const isPrivileged = ctx.user.role === "owner" || ctx.user.role === "admin";
      if (!isPrivileged && drop.ownerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only view your own drops" });
      }

      return { ...drop, kind: drop.kind as DropKind };
    }),
});

async function assertCanManage(
  ctx: { db: Database; user: { id: string; role: string } },
  dropId: string,
) {
  if (ctx.user.role === "owner" || ctx.user.role === "admin") return;
  const [drop] = await ctx.db
    .select({ ownerId: drops.ownerId })
    .from(drops)
    .where(eq(drops.id, dropId))
    .limit(1);
  if (!drop || drop.ownerId !== ctx.user.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You can only manage your own drops" });
  }
}
