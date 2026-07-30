import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";
import { checkRateLimit } from "@/server/security/rateLimit";

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        code: error.code,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

const isAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const isAdminOrOwner = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }
  if (ctx.user.role !== "admin" && ctx.user.role !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to perform this action",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

const isOwner = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    });
  }
  if (ctx.user.role !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the instance owner can perform this action",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * Per-procedure, per-IP rate limiting. Keys are scoped by procedure name so
 * hammering one endpoint doesn't lock a client out of the whole API.
 */
export function rateLimit(name: string, limit: number, windowMs: number) {
  return middleware(async ({ ctx, next }) => {
    const key = `${name}:${ctx.ip ?? "unknown"}`;
    const result = checkRateLimit(key, limit, windowMs);
    if (!result.ok) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many requests. Try again in ${Math.ceil(result.retryAfterMs / 1000)}s.`,
      });
    }
    return next();
  });
}

export const protectedProcedure = publicProcedure.use(isAuthed);
export const adminProcedure = publicProcedure.use(isAdminOrOwner);
export const ownerProcedure = publicProcedure.use(isOwner);
