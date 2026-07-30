import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createTestDb, makeCaller, resetRateLimits } from "../helpers/db";
import { drops, users, views } from "@/server/db/schema";
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

async function seedUser(
  role: "owner" | "admin" | "user",
  email: string,
): Promise<AuthenticatedUser> {
  const id = crypto.randomUUID();
  await db.insert(users).values({ id, displayName: email.split("@")[0], email, role });
  return { id, displayName: email.split("@")[0], email, role };
}

const encryptedInput = {
  title: "test secret",
  kind: "text" as const,
  body: "Y2lwaGVydGV4dA==",
  encVersion: 1 as const,
  iv: "aXZpdml2aXZpdg==",
  passwordProtected: false,
  ttlMs: 60_000,
  maxViews: 2,
};

describe("drop.create", () => {
  it("creates an encrypted drop and returns a token", async () => {
    const user = await seedUser("user", "u@example.com");
    const { caller } = makeCaller(db, user);
    const res = await caller.drop.create(encryptedInput);
    expect(res.token).toMatch(/^[0-9a-f]{32}$/);
    expect(res.url).toBe(`/d/${res.token}`);
  });

  it("requires iv for encrypted drops", async () => {
    const user = await seedUser("user", "u@example.com");
    const { caller } = makeCaller(db, user);
    await expect(caller.drop.create({ ...encryptedInput, iv: undefined })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("validates plaintext URL drops", async () => {
    const user = await seedUser("user", "u@example.com");
    const { caller } = makeCaller(db, user);
    await expect(
      caller.drop.create({
        ...encryptedInput,
        kind: "url",
        encVersion: 0,
        iv: undefined,
        body: "javascript:alert(1)",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects unauthenticated creation", async () => {
    const { caller } = makeCaller(db);
    await expect(caller.drop.create(encryptedInput)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("drop.peek / consume", () => {
  it("peek never consumes a view", async () => {
    const user = await seedUser("user", "u@example.com");
    const { caller } = makeCaller(db, user);
    const { token } = await caller.drop.create({ ...encryptedInput, maxViews: 1 });

    const { caller: publicCaller } = makeCaller(db);
    for (let i = 0; i < 5; i++) {
      const peek = await publicCaller.drop.peek({ token });
      expect(peek.available).toBe(true);
      if (peek.available) expect(peek.remaining).toBe(1);
    }
  });

  it("consume returns the ciphertext and burns exactly one view", async () => {
    const user = await seedUser("user", "u@example.com");
    const { caller } = makeCaller(db, user);
    const { token } = await caller.drop.create({ ...encryptedInput, maxViews: 2 });

    const { caller: publicCaller } = makeCaller(db);
    const first = await publicCaller.drop.consume({ token });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.body).toBe(encryptedInput.body);
      expect(first.iv).toBe(encryptedInput.iv);
      expect(first.encVersion).toBe(1);
      expect(first.remaining).toBe(1);
    }

    const second = await publicCaller.drop.consume({ token });
    expect(second.ok && second.remaining === 0).toBe(true);

    const third = await publicCaller.drop.consume({ token });
    expect(third.ok).toBe(false);
  });

  it("records a truncated IP in the view log", async () => {
    const user = await seedUser("user", "u@example.com");
    const { caller } = makeCaller(db, user);
    const { token } = await caller.drop.create(encryptedInput);

    const { caller: publicCaller } = makeCaller(db, null, { ip: "93.184.216.34" });
    await publicCaller.drop.consume({ token });

    const logged = await db.select().from(views);
    expect(logged).toHaveLength(1);
    expect(logged[0].ip).toBe("93.184.216.0/24");
  });

  it("refuses expired and revoked drops", async () => {
    const user = await seedUser("user", "u@example.com");
    const { caller } = makeCaller(db, user);

    const { token: expiredToken } = await caller.drop.create({ ...encryptedInput, ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 10));
    const { caller: publicCaller } = makeCaller(db);
    const expired = await publicCaller.drop.consume({ token: expiredToken });
    expect(expired.ok).toBe(false);

    const { token: revokedToken, id } = await caller.drop.create(encryptedInput);
    await caller.drop.revoke({ id });
    const revoked = await publicCaller.drop.consume({ token: revokedToken });
    expect(revoked.ok).toBe(false);
  });
});

describe("drop.list scoping", () => {
  it("users see only their own drops; admins see all", async () => {
    const alice = await seedUser("user", "alice@example.com");
    const bob = await seedUser("user", "bob@example.com");
    const admin = await seedUser("admin", "admin@example.com");

    await makeCaller(db, alice).caller.drop.create({ ...encryptedInput, title: "alice's" });
    await makeCaller(db, bob).caller.drop.create({ ...encryptedInput, title: "bob's" });

    const aliceList = await makeCaller(db, alice).caller.drop.list();
    expect(aliceList.items).toHaveLength(1);
    expect(aliceList.items[0].title).toBe("alice's");

    const adminList = await makeCaller(db, admin).caller.drop.list();
    expect(adminList.items).toHaveLength(2);
  });

  it("filters by status", async () => {
    const user = await seedUser("user", "u@example.com");
    const { caller } = makeCaller(db, user);
    await caller.drop.create({ ...encryptedInput, title: "long-lived" });
    const { id } = await caller.drop.create({ ...encryptedInput, title: "to-revoke" });
    await caller.drop.revoke({ id });

    const active = await caller.drop.list({ filter: "active" });
    expect(active.items.map((i) => i.title)).toEqual(["long-lived"]);

    const revoked = await caller.drop.list({ filter: "revoked" });
    expect(revoked.items.map((i) => i.title)).toEqual(["to-revoke"]);
  });

  it("never returns the body column", async () => {
    const user = await seedUser("user", "u@example.com");
    const { caller } = makeCaller(db, user);
    const { id } = await caller.drop.create(encryptedInput);

    const list = await caller.drop.list();
    expect("body" in list.items[0]).toBe(false);

    const detail = await caller.drop.get({ id });
    expect("body" in detail).toBe(false);
  });
});

describe("drop.revoke / delete permissions", () => {
  it("users cannot touch other users' drops; admins can", async () => {
    const alice = await seedUser("user", "alice@example.com");
    const bob = await seedUser("user", "bob@example.com");
    const admin = await seedUser("admin", "admin@example.com");

    const { id } = await makeCaller(db, alice).caller.drop.create(encryptedInput);

    await expect(makeCaller(db, bob).caller.drop.revoke({ id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(makeCaller(db, admin).caller.drop.revoke({ id })).resolves.toMatchObject({
      ok: true,
    });
  });

  it("delete removes the drop and its view log", async () => {
    const user = await seedUser("user", "u@example.com");
    const { caller } = makeCaller(db, user);
    const { id, token } = await caller.drop.create(encryptedInput);
    await makeCaller(db).caller.drop.consume({ token });

    expect(await db.select().from(views)).toHaveLength(1);
    await caller.drop.delete({ id });
    expect(await db.select().from(views)).toHaveLength(0);
    expect(await db.select().from(drops).where(eq(drops.id, id))).toHaveLength(0);
  });
});
