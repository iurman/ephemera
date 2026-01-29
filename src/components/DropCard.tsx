"use client";

import { Button, StatusBadge } from "./ui";
import { useCopyToClipboard } from "@/lib/hooks";
import {
  formatTimeLeft,
  formatDuration,
  formatSince,
  computeDropStatus,
  getDropUrl,
  cn,
} from "@/lib/utils";
import type { DropKind, DropStatus } from "@/lib/types";

interface DropCardProps {
  drop: {
    id: string;
    token: string;
    title: string;
    kind: DropKind;
    maxViews: number;
    usedViews: number;
    expiresAt: Date;
    revokedAt: Date | null;
    firstViewedAt: Date | null;
    lastViewedAt: Date | null;
    exhaustedAt: Date | null;
    createdAt: Date;
  };
  now: number;
  onRevoke: (id: string) => void;
  isRevoking?: boolean;
}

export function DropCard({ drop, now, onRevoke, isRevoking }: DropCardProps) {
  const { copied, copy } = useCopyToClipboard();

  const status = computeDropStatus({
    revokedAt: drop.revokedAt,
    expiresAt: drop.expiresAt,
    usedViews: drop.usedViews,
    maxViews: drop.maxViews,
    now,
  });

  const secondsLeft = Math.max(0, Math.floor((drop.expiresAt.getTime() - now) / 1000));
  const viewsLeft = Math.max(0, drop.maxViews - drop.usedViews);
  const dropUrl = getDropUrl(drop.token);

  return (
    <div
      className={cn(
        "p-4 rounded-xl border transition-colors",
        status === "active"
          ? "bg-white/5 border-white/10"
          : "bg-white/[0.02] border-white/5"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Title and kind */}
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white truncate">{drop.title}</h3>
            <span className="text-xs text-white/40 shrink-0">
              {drop.kind === "url" ? "URL" : "Text"}
            </span>
          </div>

          {/* Token link */}
          <div className="mt-1">
            <a
              href={`/d/${drop.token}`}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "text-sm font-mono",
                status === "active"
                  ? "text-white/60 hover:text-white/80 underline underline-offset-2"
                  : "text-white/30 pointer-events-none"
              )}
            >
              /d/{drop.token}
            </a>
          </div>

          {/* Stats row */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/50">
            <span>
              {drop.usedViews}/{drop.maxViews} views
            </span>
            {status === "active" && secondsLeft > 0 && (
              <span>{formatTimeLeft(secondsLeft)} left</span>
            )}
            <StatusBadge status={status} />
          </div>

          {/* Timing stats */}
          <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-white/40">
            {drop.firstViewedAt && drop.createdAt && (
              <span>
                First view in{" "}
                {formatDuration(drop.firstViewedAt.getTime() - drop.createdAt.getTime())}
              </span>
            )}
            {drop.exhaustedAt && drop.firstViewedAt && (
              <span>
                Exhausted in{" "}
                {formatDuration(drop.exhaustedAt.getTime() - drop.firstViewedAt.getTime())}
              </span>
            )}
            {drop.lastViewedAt && (
              <span>Last view {formatSince(drop.lastViewedAt, now)}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => copy(dropUrl)}
          >
            {copied ? "Copied!" : "Copy"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRevoke(drop.id)}
            disabled={status !== "active" || isRevoking}
          >
            Revoke
          </Button>
        </div>
      </div>
    </div>
  );
}
