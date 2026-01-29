"use client";

import type { DropStatus } from "@/lib/types";
import { getStatusLabel, getStatusColors, cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: DropStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { bg, text } = getStatusColors(status);
  const label = getStatusLabel(status);

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        bg,
        text,
        className
      )}
    >
      {status === "active" && (
        <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-current animate-pulse" />
      )}
      {label}
    </span>
  );
}
