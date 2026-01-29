import type { DropStatus } from "./types";

/**
 * Format time remaining in a human-readable way
 */
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

/**
 * Format a duration in milliseconds
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const seconds = Math.round(ms / 1000);
  return formatTimeLeft(seconds);
}

/**
 * Format how long ago something happened
 */
export function formatSince(date: Date, nowMs: number): string {
  const diff = Math.max(0, nowMs - date.getTime());
  return formatDuration(diff) + " ago";
}

/**
 * Compute the status of a drop
 */
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

/**
 * Get the display label for a status
 */
export function getStatusLabel(status: DropStatus): string {
  const labels: Record<DropStatus, string> = {
    active: "Active",
    expired: "Expired",
    exhausted: "Exhausted",
    revoked: "Revoked",
  };
  return labels[status];
}

/**
 * Get status colors for styling
 */
export function getStatusColors(status: DropStatus): { bg: string; text: string } {
  const colors: Record<DropStatus, { bg: string; text: string }> = {
    active: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
    expired: { bg: "bg-zinc-500/20", text: "text-zinc-400" },
    exhausted: { bg: "bg-amber-500/20", text: "text-amber-400" },
    revoked: { bg: "bg-red-500/20", text: "text-red-400" },
  };
  return colors[status];
}

/**
 * Escape HTML for safe rendering
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Convert plain text to HTML with line breaks
 */
export function textToHtml(str: string): string {
  return escapeHtml(str).replace(/\n/g, "<br/>");
}

/**
 * Truncate text with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + "…";
}

/**
 * Validate URL format
 */
export function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Generate a URL for a drop
 */
export function getDropUrl(token: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/d/${token}`;
  }
  return `/d/${token}`;
}

/**
 * Classnames utility (simplified version of clsx)
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
