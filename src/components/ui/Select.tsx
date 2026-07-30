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
          "rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink",
          "focus:ring-2 focus:ring-ember/50 focus:outline-none",
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
