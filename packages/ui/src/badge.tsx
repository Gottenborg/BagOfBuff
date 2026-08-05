import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "brand" | "neutral" | "success" | "danger" | "outline";

const variants: Record<Variant, string> = {
  brand: "bg-buff-100 text-buff-900",
  neutral: "bg-subtle text-ink-700",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  outline: "border border-border text-muted",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

/** Small status/label pill. */
export function Badge({
  variant = "neutral",
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
