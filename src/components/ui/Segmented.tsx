"use client";

import { cn } from "@/lib/utils";

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  size?: "sm" | "md";
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "bg-surface border-line inline-flex items-center gap-0.5 rounded-lg border p-0.5",
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          type="button"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === opt.value
              ? "bg-surface-2 text-ink shadow-sm"
              : "text-ink-faint hover:text-ink-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
