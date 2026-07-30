"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <textarea
          ref={ref}
          className={cn(
            "bg-surface text-ink placeholder-ink-faint w-full rounded-lg border px-3 py-2",
            "focus:ring-ember/50 font-mono text-sm transition-colors focus:ring-2 focus:outline-none",
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

Textarea.displayName = "Textarea";
