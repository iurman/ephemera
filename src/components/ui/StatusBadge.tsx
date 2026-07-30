"use client";

import type { DropStatus } from "@/lib/types";
import { getStatusLabel, cn } from "@/lib/utils";

// Status colors are reserved for state and always ship with a text label.
const statusStyles: Record<DropStatus, string> = {
  active: "bg-ok-soft text-ok",
  expired: "bg-line text-ink-faint",
  exhausted: "bg-warn-soft text-warn",
  revoked: "bg-danger-soft text-danger",
};

interface StatusBadgeProps {
  status: DropStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        statusStyles[status],
        className,
      )}
    >
      {status === "active" && (
        <span className="mr-1.5 size-1.5 animate-ember-pulse rounded-full bg-current" />
      )}
      {getStatusLabel(status)}
    </span>
  );
}
