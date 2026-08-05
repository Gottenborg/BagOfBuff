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
