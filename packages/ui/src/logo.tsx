import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export interface BobMarkProps {
  className?: string;
  title?: string;
}

/**
 * BOB — the brand mark. A friendly rounded-square face rather than a
 * supplement-industry cliché (no flames, no lightning). Minimal and
 * recognizable from across the room. Renders as inline SVG, no assets.
 */
export function BobMark({ className, title = "Bag of Buff" }: BobMarkProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label={title}
      className={cn("h-8 w-8", className)}
    >
      <rect x="1" y="1" width="38" height="38" rx="11" className="fill-brand" />
      <circle cx="14.5" cy="17" r="3" className="fill-ink-950" />
      <circle cx="25.5" cy="17" r="3" className="fill-ink-950" />
      <path
        d="M13 26c2 2.4 4.3 3.6 7 3.6s5-1.2 7-3.6"
        fill="none"
        strokeLinecap="round"
        strokeWidth="3"
        className="stroke-ink-950"
      />
    </svg>
  );
}

export interface LogoProps extends HTMLAttributes<HTMLSpanElement> {
  /** Hide the wordmark and show only the BOB face mark. */
  markOnly?: boolean;
}

/** BOB mark + "Bag of Buff" wordmark, locked up together. */
export function Logo({ markOnly, className, ...props }: LogoProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      {...props}
    >
      <BobMark />
      {!markOnly && (
        <span className="font-display text-lg font-extrabold tracking-tightest text-foreground">
          Bag of Buff
        </span>
      )}
    </span>
  );
}
