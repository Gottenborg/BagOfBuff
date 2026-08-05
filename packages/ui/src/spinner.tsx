import type { ReactNode } from "react";
import { cn } from "./cn";

export interface SpinnerProps {
  className?: string;
  label?: string;
}

/** Accessible loading spinner. */
export function Spinner({ className, label = "Loading" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-brand align-[-0.125em]",
        className,
      )}
    />
  );
}

export interface LoadingProps {
  className?: string;
  children?: ReactNode;
}

/** Spinner + label row for inline "loading…" states. */
export function Loading({ className, children = "Loading…" }: LoadingProps) {
  return (
    <p className={cn("flex items-center gap-2 text-muted", className)}>
      <Spinner /> {children}
    </p>
  );
}
