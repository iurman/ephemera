// src/app/api/ping/route.ts
// Lightweight health check for Docker/Traefik health probes
// For detailed diagnostics, use /api/health

const startTime = Date.now();

export async function GET() {
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  // Log ping for debugging (visible in container logs)
  console.log(`[PING] Health check at ${new Date().toISOString()} (uptime: ${uptime}s)`);

  return new Response(
    JSON.stringify({
      ok: true,
      timestamp: new Date().toISOString(),
      uptime,
    }),
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-cache",
      },
    }
  );
}
