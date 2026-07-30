"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-black hover:bg-accent-bright shadow-[0_0_20px_rgba(255,255,255,0.12)] hover:shadow-[0_0_28px_rgba(255,255,255,0.2)]",
  secondary: "bg-surface-2 text-ink hover:bg-line border border-line-strong",
  ghost: "text-ink-muted hover:text-ink hover:bg-line",
  danger: "bg-danger-soft text-danger hover:bg-danger/25 border border-danger/20",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-sm rounded-lg gap-1.5",
  md: "px-3.5 py-1.5 text-sm rounded-lg gap-2",
  lg: "px-5 py-2.5 text-base rounded-xl gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "secondary", size = "md", loading, disabled, children, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all duration-150",
          "focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:outline-none",
          "disabled:pointer-events-none disabled:opacity-50",
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
