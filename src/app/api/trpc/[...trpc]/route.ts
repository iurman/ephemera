import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/trpc/root";
import { createContext } from "@/server/trpc/context";

// read `sid` cookie from the request
function readSidCookie(req: Request) {
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.match(/(?:^|;\s*)sid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => createContext({ sid: readSidCookie(req) }),
    responseMeta({ ctx }) {
      const headers = new Headers();
      if (ctx?.setCookies?.length) {
        for (const sc of ctx.setCookies) headers.append("Set-Cookie", sc);
      }
      return { headers };
    },
  });

export { handler as GET, handler as POST };
