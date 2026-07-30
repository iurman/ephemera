import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/trpc/root";
import { createContext } from "@/server/trpc/context";

function readSidCookie(req: Request): string | null {
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.match(/(?:^|;\s*)sid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function clientIp(req: Request): string | null {
  // Behind Traefik/Coolify the left-most XFF entry is the client.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

/**
 * Cross-origin browser requests are rejected as CSRF defense-in-depth
 * (SameSite=Lax cookies are the primary layer). Requests without an Origin
 * header (curl, server-to-server) pass through.
 */
function isCrossOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(req.url).host;
  } catch {
    return true;
  }
}

const handler = (req: Request) => {
  if (req.method !== "GET" && isCrossOrigin(req)) {
    return new Response("Cross-origin requests are not allowed", { status: 403 });
  }

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () =>
      createContext({
        sid: readSidCookie(req),
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      }),
    responseMeta({ ctx }) {
      const headers = new Headers();
      if (ctx?.setCookies?.length) {
        for (const sc of ctx.setCookies) headers.append("Set-Cookie", sc);
      }
      return { headers };
    },
  });
};

export { handler as GET, handler as POST };
