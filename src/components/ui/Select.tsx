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
          "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white",
          "focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "[&>option]:bg-zinc-900 [&>option]:text-white",
          className
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
  }
);

Select.displayName = "Select";
