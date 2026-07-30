"use client";

import { Button } from "./Button";
import { useCopyToClipboard } from "@/lib/hooks";

interface CopyButtonProps {
  text: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}

export function CopyButton({
  text,
  label = "Copy",
  size = "sm",
  variant = "secondary",
  className,
}: CopyButtonProps) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <Button size={size} variant={variant} className={className} onClick={() => copy(text)}>
      {copied ? "Copied!" : label}
    </Button>
  );
}
