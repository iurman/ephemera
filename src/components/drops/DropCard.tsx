"use client";

import Link from "next/link";
import { StatusBadge, Button, ProgressRing, CopyButton } from "@/components/ui";
import { formatTimeLeft, formatSince, computeDropStatus, getDropUrl, cn } from "@/lib/utils";
import type { DropListItem } from "@/lib/types";

interface DropCardProps {
  drop: DropListItem;
  now: number;
  onRevoke: (id: string) => void;
  onDelete: (id: string) => void;
  busy?: boolean;
}

const kindLabels = { text: "Text", url: "Link", file: "File" } as const;

export function DropCard({ drop, now, onRevoke, onDelete, busy }: DropCardProps) {
  const status = computeDropStatus({ ...drop, now });
  const secondsLeft = Math.max(0, Math.floor((drop.expiresAt.getTime() - now) / 1000));
  const viewsLeft = Math.max(0, drop.maxViews - drop.usedViews);
  const ttlTotalMs = Math.max(1, drop.expiresAt.getTime() - drop.createdAt.getTime());
  const ttlFraction = Math.max(0, Math.min(1, (drop.expiresAt.getTime() - now) / ttlTotalMs));

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition-colors",
        status === "active" ? "border-line-strong bg-surface" : "border-line bg-surface/40",
      )}
    >
      <div className="flex items-start gap-4">
        <ProgressRing
          fraction={drop.maxViews > 0 ? viewsLeft / drop.maxViews : 0}
          label={`${viewsLeft}`}
          sublabel="views left"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium text-ink">{drop.title}</h3>
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-faint">
              {kindLabels[drop.kind]}
            </span>
            {drop.encVersion > 0 && (
              <span
                className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-faint"
                title={
                  drop.passwordProtected
                    ? "End-to-end encrypted with a passphrase"
                    : "End-to-end encrypted; key lives in the share link"
                }
              >
                {drop.passwordProtected ? "E2E + passphrase" : "E2E"}
              </span>
            )}
            <StatusBadge status={status} />
          </div>

          <p className="mt-1 truncate font-mono text-xs text-ink-faint">/d/{drop.token}</p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span>
              {drop.usedViews}/{drop.maxViews} views
            </span>
            {status === "active" && <span>{formatTimeLeft(secondsLeft)} left</span>}
            {drop.lastViewedAt && <span>last view {formatSince(drop.lastViewedAt, now)}</span>}
            {drop.purgedAt && <span className="text-ink-faint">content purged</span>}
          </div>

          {status === "active" && (
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-ember transition-[width] duration-1000"
                style={{ width: `${ttlFraction * 100}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex gap-1.5">
            {(drop.encVersion === 0 || drop.passwordProtected) && status === "active" && (
              <CopyButton text={getDropUrl(drop.token)} label="Copy link" />
            )}
            <Link href={`/dashboard/drops/${drop.id}`}>
              <Button size="sm" variant="ghost">
                Details
              </Button>
            </Link>
          </div>
          <div className="flex gap-1.5">
            {status === "active" && (
              <Button size="sm" variant="ghost" onClick={() => onRevoke(drop.id)} disabled={busy}>
                Revoke
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={() => onDelete(drop.id)} disabled={busy}>
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
