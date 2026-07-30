export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPurgeLoop } = await import("@/server/purge");
    startPurgeLoop();
  }
}
