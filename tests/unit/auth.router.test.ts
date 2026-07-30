import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, makeCaller, resetRateLimits } from "../helpers/db";
import { sessions, users } from "@/server/db/schema";
import type { Database } from "@/server/db/client";
import type { AuthenticatedUser } from "@/server/trpc/context";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  resetRateLimits();
});

afterEach(async () => {
  await close();
});

async function bootstrapOwner(): Promise<AuthenticatedUser> {
  const { caller, ctx } = makeCaller(db);
  await caller.auth.bootstrapOwner({
    displayName: "Owner",
    email: "owner@example.com",
    password: "password123",
  });
  expect(ctx.setCookies.some((c) => c.startsWith("sid="))).toBe(true);
  const [owner] = await db.select().from(users).where(eq(users.email, "owner@example.com"));
  return { id: owner.id, displayName: owner.displayName, email: owner.email, role: "owner" };
}

describe("bootstrapOwner", () => {
  it("creates the owner with credentials and a session", async () => {
    const owner = await bootstrapOwner();
    expect(owner.role).toBe("owner");
    const allSessions = await db.select().from(sessions);
    expect(allSessions).toHaveLength(1);
  });

  it("refuses when any account exists", async () => {
    await bootstrapOwner();
    const { caller } = makeCaller(db);
    await expect(
      caller.auth.bootstrapOwner({
        displayName: "Second",
        email: "second@example.com",
        password: "password123",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("login", () => {
  it("logs in with correct credentials", async () => {
    await bootstrapOwner();
    const { caller, ctx } = makeCaller(db);
    const res = await caller.auth.login({ email: "owner@example.com", password: "password123" });
    expect(res.ok).toBe(true);
    expect(ctx.setCookies.some((c) => c.startsWith("sid="))).toBe(true);
  });

  it("rejects a wrong password and an unknown email identically", async () => {
    await bootstrapOwner();
    const { caller } = makeCaller(db);
    await expect(
      caller.auth.login({ email: "owner@example.com", password: "wrong-password" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid email or password" });
    await expect(
      caller.auth.login({ email: "ghost@example.com", password: "whatever1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid email or password" });
  });

  it("rate limits repeated attempts from one IP", async () => {
    await bootstrapOwner();
    const { caller } = makeCaller(db, null, { ip: "198.51.100.1" });
    for (let i = 0; i < 10; i++) {
      await caller.auth
        .login({ email: "owner@example.com", password: "bad-guess-xx" })
        .catch(() => {});
    }
    await expect(
      caller.auth.login({ email: "owner@example.com", password: "password123" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

describe("invites", () => {
  it("full lifecycle: create, consume, single-use", async () => {
    const owner = await bootstrapOwner();

    const { caller: ownerCaller } = makeCaller(db, owner);
    const invite = await ownerCaller.auth.createInvite({ expiresMinutes: 60 });
    const token = new URL(`http://x${invite.url}`).searchParams.get("token")!;

    const { caller: guestCaller } = makeCaller(db);
    const res = await guestCaller.auth.consumeInvite({
      token,
      displayName: "Guest",
      email: "guest@example.com",
      password: "password456",
    });
    expect(res.ok).toBe(true);

    // Second use fails.
    const { caller: guest2 } = makeCaller(db);
    await expect(
      guest2.auth.consumeInvite({
        token,
        displayName: "Sneaky",
        email: "sneaky@example.com",
        password: "password789",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("regular users cannot create invites", async () => {
    const owner = await bootstrapOwner();
    const { caller: ownerCaller } = makeCaller(db, owner);
    const invite = await ownerCaller.auth.createInvite({ expiresMinutes: 60 });
    const token = new URL(`http://x${invite.url}`).searchParams.get("token")!;

    const { caller: guestCaller } = makeCaller(db);
    await guestCaller.auth.consumeInvite({
      token,
      displayName: "Guest",
      email: "guest@example.com",
      password: "password456",
    });
    const [guest] = await db.select().from(users).where(eq(users.email, "guest@example.com"));

    const { caller: userCaller } = makeCaller(db, {
      id: guest.id,
      displayName: guest.displayName,
      email: guest.email,
      role: "user",
    });
    await expect(userCaller.auth.createInvite({ expiresMinutes: 60 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects duplicate emails", async () => {
    const owner = await bootstrapOwner();
    const { caller: ownerCaller } = makeCaller(db, owner);
    const invite = await ownerCaller.auth.createInvite({ expiresMinutes: 60 });
    const token = new URL(`http://x${invite.url}`).searchParams.get("token")!;

    const { caller } = makeCaller(db);
    await expect(
      caller.auth.consumeInvite({
        token,
        displayName: "Clone",
        email: "owner@example.com",
        password: "password456",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("changePassword / logout", () => {
  it("changes password only with the current one", async () => {
    const owner = await bootstrapOwner();
    const { caller } = makeCaller(db, owner);

    await expect(
      caller.auth.changePassword({ currentPassword: "nope-nope", newPassword: "newpassword1" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await caller.auth.changePassword({
      currentPassword: "password123",
      newPassword: "newpassword1",
    });

    const { caller: fresh } = makeCaller(db);
    await expect(
      fresh.auth.login({ email: "owner@example.com", password: "newpassword1" }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("logoutAll clears every session for the user", async () => {
    const owner = await bootstrapOwner();
    const { caller: login1 } = makeCaller(db);
    await login1.auth.login({ email: "owner@example.com", password: "password123" });
    const { caller: login2 } = makeCaller(db);
    await login2.auth.login({ email: "owner@example.com", password: "password123" });

    expect(await db.select().from(sessions)).toHaveLength(3); // bootstrap + 2 logins

    const { caller } = makeCaller(db, owner);
    await caller.auth.logoutAll();
    expect(await db.select().from(sessions)).toHaveLength(0);
  });
});
