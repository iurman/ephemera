// Lightweight liveness probe for Docker/Traefik health checks.
export async function GET() {
  return Response.json({ ok: true });
}
