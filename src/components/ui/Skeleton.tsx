"use client";

import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("bg-line animate-pulse rounded-lg", className)} aria-hidden />;
}
