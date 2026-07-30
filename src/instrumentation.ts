export async function register() {
  // On serverless (Vercel) there is no resident process to host a timer —
  // the retention sweep runs via Vercel Cron hitting /api/cron/purge instead.
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { startPurgeLoop } = await import("@/server/purge");
    startPurgeLoop();
  }
}
