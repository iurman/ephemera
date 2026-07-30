"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "bg-surface border-line-strong text-ink rounded-lg border px-3 py-2 text-sm",
          "focus:ring-ember/50 focus:ring-2 focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "[&>option]:bg-surface-2 [&>option]:text-ink",
          className,
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  },
);

Select.displayName = "Select";
