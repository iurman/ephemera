export async function POST() {
  const exp = new Date(Date.now() + 10 * 60 * 1000);
  const cookie = [
    `sid=debug-${Math.random().toString(36).slice(2)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${exp.toUTCString()}`,
  ].join("; ");
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": cookie },
  });
}
