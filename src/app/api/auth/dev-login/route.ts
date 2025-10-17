import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { users, sessions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

function makeSessionCookie(id: string, exp: Date) {
  const parts = [
    `sid=${encodeURIComponent(id)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${exp.toUTCString()}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

export async function POST(req: Request) {
  // Hard stop outside dev
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Disabled in production", { status: 403 });
  }

  const { username, password } = await req.json().catch(() => ({}));

  if (
    !username ||
    !password ||
    username !== process.env.DEV_ADMIN_USER ||
    password !== process.env.DEV_ADMIN_PASS
  ) {
    return new NextResponse("Invalid credentials", { status: 401 });
  }

  // Ensure an owner exists (create if missing)
  const displayName = "Dev Owner";
  let owner = (
    await db
      .select()
      .from(users)
      .where(eq(users.role, "owner"))
      .limit(1)
  )[0];

  if (!owner) {
    owner = {
      id: crypto.randomUUID(),
      displayName,
      role: "owner" as const,
      email: null as any, // if your schema has email nullable
      createdAt: new Date(),
    };
    await db.insert(users).values({
      id: owner.id,
      displayName: owner.displayName,
      role: owner.role,
    });
  }

  // Create session
  const sid = crypto.randomUUID();
  const exp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: sid, userId: owner.id, expiresAt: exp });

  // Set cookie and return
  const res = new NextResponse(null, { status: 204 });
  res.headers.append("Set-Cookie", makeSessionCookie(sid, exp));
  return res;
}
