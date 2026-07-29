import { pgTable, varchar, text, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ---------- Drops & Views ---------- */
export const drops = pgTable(
  "drops",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    token: varchar("token", { length: 64 }).notNull().unique(),

    // who created it + kind ("text" | "url" | "file")
    ownerId: varchar("owner_id", { length: 36 }),
    kind: varchar("kind", { length: 16 }).notNull().default("text"),

    // Plaintext label shown on the owner's dashboard. Never contains the
    // secret — the secret lives in `body`.
    title: text("title").notNull(),

    // encVersion 0: legacy plaintext body.
    // encVersion 1: body is base64 AES-256-GCM ciphertext of a DropEnvelope,
    //   encrypted client-side. The server never sees the key.
    body: text("body").notNull(),
    encVersion: integer("enc_version").notNull().default(0),
    iv: text("iv"),
    // PBKDF2 salt, present only for passphrase-protected drops.
    kdfSalt: text("kdf_salt"),
    passwordProtected: boolean("password_protected").notNull().default(false),

    ttlMs: integer("ttl_ms").notNull(),
    maxViews: integer("max_views").notNull(),
    usedViews: integer("used_views").notNull().default(0),

    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),

    // metrics
    firstViewedAt: timestamp("first_viewed_at"),
    lastViewedAt: timestamp("last_viewed_at"),
    exhaustedAt: timestamp("exhausted_at"),

    // retention: when the body was blanked by the purge job
    purgedAt: timestamp("purged_at"),
  },
  (t) => [
    index("drops_token_idx").on(t.token),
    index("drops_state_idx").on(t.expiresAt, t.revokedAt, t.usedViews, t.maxViews),
    index("drops_owner_idx").on(t.ownerId),
  ],
);

export const views = pgTable(
  "views",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    dropId: varchar("drop_id", { length: 36 }).notNull().references(() => drops.id),
    viewedAt: timestamp("viewed_at").notNull().default(sql`now()`),
    ua: text("ua"),
    // Truncated before storage (IPv4 /24, IPv6 /48) — see truncateIp().
    ip: text("ip"),
  },
  (t) => [index("views_drop_idx").on(t.dropId), index("views_time_idx").on(t.viewedAt)],
);

/* ---------- Users / Sessions / Invites ---------- */
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: text("email").unique(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("user"), // "owner" | "admin" | "user"
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const invites = pgTable(
  "invites",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    createdBy: varchar("created_by", { length: 36 }).notNull().references(() => users.id),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    expiresAt: timestamp("expires_at").notNull(),
    usedBy: varchar("used_by", { length: 36 }),
    usedAt: timestamp("used_at"),
    maxUses: integer("max_uses").notNull().default(1),
  },
  (t) => [index("invites_exp_idx").on(t.expiresAt)],
);
