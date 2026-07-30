import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { createTestDb } from "../helpers/db";
import { drops, views, sessions, invites, users } from "@/server/db/schema";
import { runPurge } from "@/server/purge";
import type { Database } from "@/server/db/client";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});

afterEach(async () => {
  await close();
});

const DAY = 24 * 60 * 60 * 1000;

async function seedDrop(overrides: Partial<typeof drops.$inferInsert> = {}) {
  const id = crypto.randomUUID();
  await db.insert(drops).values({
    id,
    token: crypto.randomBytes(16).toString("hex"),
    title: "t",
    body: "ciphertext",
    ttlMs: 60_000,
    maxViews: 1,
    createdAt: new Date(Date.now() - 10 * DAY),
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  });
  return id;
}

describe("runPurge", () => {
  it("blanks bodies of drops dead for longer than the retention window", async () => {
    const now = new Date();

    const expiredOld = await seedDrop({ expiresAt: new Date(now.getTime() - 5 * DAY) });
    const expiredRecent = await seedDrop({ expiresAt: new Date(now.getTime() - 60_000) });
    const active = await seedDrop({ expiresAt: new Date(now.getTime() + DAY) });
    const revokedOld = await seedDrop({
      expiresAt: new Date(now.getTime() + DAY),
      revokedAt: new Date(now.getTime() - 5 * DAY),
    });
    const exhaustedOld = await seedDrop({
      expiresAt: new Date(now.getTime() + DAY),
      usedViews: 1,
      exhaustedAt: new Date(now.getTime() - 5 * DAY),
    });

    await runPurge(db, now);

    const byId = async (id: string) => (await db.select().from(drops).where(eq(drops.id, id)))[0];

    expect((await byId(expiredOld)).body).toBe("");
    expect((await byId(expiredOld)).purgedAt).not.toBeNull();
    expect((await byId(revokedOld)).body).toBe("");
    expect((await byId(exhaustedOld)).body).toBe("");

    // Inside the retention grace window or still alive — untouched.
    expect((await byId(expiredRecent)).body).toBe("ciphertext");
    expect((await byId(active)).body).toBe("ciphertext");
  });

  it("is idempotent", async () => {
    const now = new Date();
    const id = await seedDrop({ expiresAt: new Date(now.getTime() - 5 * DAY) });

    await runPurge(db, now);
    const [first] = await db.select().from(drops).where(eq(drops.id, id));
    await runPurge(db, now);
    const [second] = await db.select().from(drops).where(eq(drops.id, id));

    expect(second.purgedAt?.getTime()).toBe(first.purgedAt?.getTime());
  });

  it("prunes old views, expired sessions, and stale invites", async () => {
    const now = new Date();
    const dropId = await seedDrop({});

    await db.insert(views).values([
      {
        id: crypto.randomUUID(),
        dropId,
        viewedAt: new Date(now.getTime() - 40 * DAY),
      },
      {
        id: crypto.randomUUID(),
        dropId,
        viewedAt: new Date(now.getTime() - 1 * DAY),
      },
    ]);

    const userId = crypto.randomUUID();
    await db.insert(users).values({ id: userId, displayName: "u", email: "u@x.com", role: "user" });
    await db.insert(sessions).values([
      { id: crypto.randomUUID(), userId, expiresAt: new Date(now.getTime() - DAY) },
      { id: crypto.randomUUID(), userId, expiresAt: new Date(now.getTime() + DAY) },
    ]);
    await db.insert(invites).values([
      {
        id: crypto.randomUUID(),
        tokenHash: "hash-old",
        createdBy: userId,
        expiresAt: new Date(now.getTime() - 8 * DAY),
      },
      {
        id: crypto.randomUUID(),
        tokenHash: "hash-live",
        createdBy: userId,
        expiresAt: new Date(now.getTime() + 60_000),
      },
    ]);

    await runPurge(db, now);

    expect(await db.select().from(views)).toHaveLength(1);
    expect(await db.select().from(sessions)).toHaveLength(1);
    expect(await db.select().from(invites)).toHaveLength(1);
  });
});
