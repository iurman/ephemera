/**
 * In-memory fixed-window rate limiter.
 *
 * Ephemera deploys as a single container, so process-local state is the
 * right tradeoff — no Redis dependency for a self-hosted app. If the app is
 * ever scaled horizontally this needs to move to a shared store.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 50_000;

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) sweep(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterMs: bucket.resetAt - now };
  }
  return { ok: true, retryAfterMs: 0 };
}

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Under active abuse the map can stay full of live buckets; drop oldest.
  if (buckets.size >= MAX_BUCKETS) {
    const excess = buckets.size - MAX_BUCKETS + 1000;
    let i = 0;
    for (const key of buckets.keys()) {
      if (i++ >= excess) break;
      buckets.delete(key);
    }
  }
}

/** Test helper — clears all buckets. */
export function resetRateLimits() {
  buckets.clear();
}

/**
 * Truncate an IP for privacy before storing: IPv4 to /24, IPv6 to /48.
 * Keeps view analytics useful (unique-ish networks) without keeping PII.
 */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":");
    return `${parts.slice(0, 3).join(":")}::/48`;
  }
  const parts = trimmed.split(".");
  if (parts.length !== 4) return null;
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}
