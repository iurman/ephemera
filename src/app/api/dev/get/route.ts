export async function GET(req: Request) {
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.match(/(?:^|;\s*)sid=([^;]+)/);
  return new Response(JSON.stringify({ sid: m ? decodeURIComponent(m[1]) : null }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
