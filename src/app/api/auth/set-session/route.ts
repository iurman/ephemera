import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const sid: string | undefined = body?.sid;
    const expires: string | undefined = body?.expires; // UTC string

    if (!sid || !expires) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    const parts = [
      `sid=${encodeURIComponent(sid)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Expires=${expires}`,
    ];
    if (process.env.NODE_ENV === "production") parts.push("Secure");

    const res = new NextResponse(null, { status: 204 });
    res.headers.append("Set-Cookie", parts.join("; "));
    return res;
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }
}
