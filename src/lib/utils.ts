import type { DropStatus } from "./types";

/** Format time remaining in a human-readable way. */
export function formatTimeLeft(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0s";

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes >= 5) return `~${minutes}m`;
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, "0")}`;
  return `${seconds}s`;
}

/** Format a duration in milliseconds. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  return formatTimeLeft(Math.round(ms / 1000));
}

/** Format how long ago something happened. */
export function formatSince(date: Date, nowMs: number): string {
  const diff = Math.max(0, nowMs - date.getTime());
  return formatDuration(diff) + " ago";
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Compute the lifecycle status of a drop. */
export function computeDropStatus({
  revokedAt,
  expiresAt,
  usedViews,
  maxViews,
  now,
}: {
  revokedAt: Date | null;
  expiresAt: Date;
  usedViews: number;
  maxViews: number;
  now: number;
}): DropStatus {
  if (revokedAt) return "revoked";
  if (new Date(expiresAt).getTime() <= now) return "expired";
  if (usedViews >= maxViews) return "exhausted";
  return "active";
}

export function getStatusLabel(status: DropStatus): string {
  const labels: Record<DropStatus, string> = {
    active: "Active",
    expired: "Expired",
    exhausted: "Exhausted",
    revoked: "Revoked",
  };
  return labels[status];
}

/** Truncate text with ellipsis. */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + "…";
}

/** Validate URL format (http/https only). */
export function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Absolute URL for a drop (without key fragment). */
export function getDropUrl(token: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/d/${token}`;
  }
  return `/d/${token}`;
}

/** Compact user-agent summary for the views table. */
export function summarizeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown";
  if (/bot|crawl|spider|preview|fetch|curl|wget/i.test(ua)) return "Bot / preview";
  const browser = ua.match(/(Firefox|Edg|OPR|Chrome|Safari)\/[\d.]+/)?.[1] ?? "Browser";
  const os = ua.match(/\((Windows|Macintosh|X11; Linux|Android|iPhone|iPad)/)?.[1] ?? "";
  const browserName = browser === "Edg" ? "Edge" : browser === "OPR" ? "Opera" : browser;
  const osName = os === "X11; Linux" ? "Linux" : os === "Macintosh" ? "macOS" : os;
  return osName ? `${browserName} · ${osName}` : browserName;
}

/** Classnames utility (simplified clsx). */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
