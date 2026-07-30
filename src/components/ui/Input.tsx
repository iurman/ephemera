"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="text-ink-muted mb-1.5 block text-sm">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "bg-surface text-ink placeholder-ink-faint w-full rounded-lg border px-3 py-2",
            "focus:ring-ember/50 transition-colors focus:ring-2 focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error ? "border-danger/50" : "border-line-strong focus:border-transparent",
            className,
          )}
          {...props}
        />
        {error && <p className="text-danger mt-1 text-sm">{error}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";
