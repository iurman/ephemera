import { runPurge } from "@/server/purge";

/**
 * Retention sweep as an HTTP endpoint, for platforms without a resident
 * process (Vercel Cron hits this on a schedule). On self-hosted Docker the
 * in-process loop in instrumentation.ts does the same job and this route is
 * simply never called.
 *
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}` automatically when the
 * CRON_SECRET env var is set. Without a configured secret the route refuses
 * to run at all.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("CRON_SECRET is not configured", { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runPurge();
  return Response.json({ ok: true, ...result });
}
