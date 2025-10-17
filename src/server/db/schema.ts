import { pgTable, varchar, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ---------- Drops & Views ---------- */
export const drops = pgTable(
  "drops",
  {
    id: varchar("id", 36).primaryKey(),
    token: varchar("token", 64).notNull().unique(),

    // who created it + kind
    ownerId: varchar("owner_id", 36),
    kind: varchar("kind", 16).notNull().default("text"), // "text" | "url"

    title: text("title").notNull(),
    body: text("body").notNull(), // text content or URL

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
  },
  (t) => ({
    tokenIdx: index("drops_token_idx").on(t.token),
    stateIdx: index("drops_state_idx").on(t.expiresAt, t.revokedAt, t.usedViews, t.maxViews),
    ownerIdx: index("drops_owner_idx").on(t.ownerId),
  }),
);

export const views = pgTable(
  "views",
  {
    id: varchar("id", 36).primaryKey(),
    dropId: varchar("drop_id", 36).notNull().references(() => drops.id),
    viewedAt: timestamp("viewed_at").notNull().default(sql`now()`),
    ua: text("ua"),
    ip: text("ip"),
  },
  (t) => ({
    dropIdx: index("views_drop_idx").on(t.dropId),
    timeIdx: index("views_time_idx").on(t.viewedAt),
  }),
);

/* ---------- Users / Sessions / Invites ---------- */
export const users = pgTable("users", {
  id: varchar("id", 36).primaryKey(),
  email: text("email").unique(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("user"), // "owner" | "admin" | "user"
  passwordHash: text("password_hash"),          // <-- NEW (nullable for existing rows / owner bootstrap)
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", 36).primaryKey(),
    userId: varchar("user_id", 36).notNull().references(() => users.id),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
  }),
);

export const invites = pgTable(
  "invites",
  {
    id: varchar("id", 36).primaryKey(),
    tokenHash: varchar("token_hash", 128).notNull().unique(),
    createdBy: varchar("created_by", 36).notNull().references(() => users.id),
    createdAt: timestamp("created_at").notNull().default(sql`now()`),
    expiresAt: timestamp("expires_at").notNull(),
    usedBy: varchar("used_by", 36),
    usedAt: timestamp("used_at"),
    maxUses: integer("max_uses").notNull().default(1),
  },
  (t) => ({
    expireIdx: index("invites_exp_idx").on(t.expiresAt),
  }),
);
