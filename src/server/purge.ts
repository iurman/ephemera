import { sql } from "drizzle-orm";
import { db as defaultDb, type Database } from "@/server/db/client";

/**
 * Retention sweep — makes "ephemeral" true at the storage layer, not just
 * the API layer.
 *
 * - Dead drops (expired / exhausted / revoked) have their body blanked after
 *   RETENTION_DAYS (default 3). Metadata stays for the dashboard.
 * - View log rows older than VIEWS_RETENTION_DAYS (default 30) are deleted.
 * - Expired sessions and long-dead invites are deleted.
 */
export interface PurgeResult {
  bodiesPurged: number;
  viewsDeleted: number;
  sessionsDeleted: number;
  invitesDeleted: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function runPurge(db: Database = defaultDb, now = new Date()): Promise<PurgeResult> {
  const retentionMs = envInt("RETENTION_DAYS", 3) * 24 * 60 * 60 * 1000;
  const viewsRetentionMs = envInt("VIEWS_RETENTION_DAYS", 30) * 24 * 60 * 60 * 1000;

  const dropCutoff = new Date(now.getTime() - retentionMs);
  const viewsCutoff = new Date(now.getTime() - viewsRetentionMs);
  const inviteCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const purged = await db.execute(sql`
    UPDATE drops SET body = '', purged_at = ${now}
    WHERE purged_at IS NULL
      AND body <> ''
      AND (
        (revoked_at IS NOT NULL AND revoked_at < ${dropCutoff})
        OR expires_at < ${dropCutoff}
        OR (exhausted_at IS NOT NULL AND exhausted_at < ${dropCutoff})
      )
  `);

  const views = await db.execute(sql`DELETE FROM views WHERE viewed_at < ${viewsCutoff}`);
  const sessions = await db.execute(sql`DELETE FROM sessions WHERE expires_at < ${now}`);
  const invites = await db.execute(sql`DELETE FROM invites WHERE expires_at < ${inviteCutoff}`);

  return {
    bodiesPurged: purged.rowCount ?? 0,
    viewsDeleted: views.rowCount ?? 0,
    sessionsDeleted: sessions.rowCount ?? 0,
    invitesDeleted: invites.rowCount ?? 0,
  };
}

const globalForPurge = globalThis as unknown as { __ephemeraPurgeTimer?: NodeJS.Timeout };

/** Start the recurring sweep. Safe to call more than once. */
export function startPurgeLoop() {
  if (globalForPurge.__ephemeraPurgeTimer) return;

  const intervalMs = envInt("PURGE_INTERVAL_MIN", 60) * 60 * 1000;

  const tick = async () => {
    try {
      const result = await runPurge();
      const total =
        result.bodiesPurged + result.viewsDeleted + result.sessionsDeleted + result.invitesDeleted;
      if (total > 0) {
        console.log(
          `[purge] bodies=${result.bodiesPurged} views=${result.viewsDeleted} ` +
            `sessions=${result.sessionsDeleted} invites=${result.invitesDeleted}`,
        );
      }
    } catch (err) {
      console.error("[purge] sweep failed:", err);
    }
  };

  // First sweep shortly after boot, then on the interval.
  setTimeout(tick, 15_000);
  globalForPurge.__ephemeraPurgeTimer = setInterval(tick, intervalMs);
}
