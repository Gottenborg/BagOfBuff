import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type HeadingLevel = 1 | 2 | 3 | 4;

const headingSizes: Record<HeadingLevel, string> = {
  1: "text-4xl sm:text-5xl",
  2: "text-3xl",
  3: "text-2xl",
  4: "text-xl",
};

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: HeadingLevel;
}

/** Display heading using the brand display font. */
export function Heading({ level = 1, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag
      className={cn(
        "font-display font-extrabold tracking-tightest text-foreground",
        headingSizes[level],
        className,
      )}
      {...props}
    />
  );
}

export interface TextProps extends HTMLAttributes<HTMLParagraphElement> {
  muted?: boolean;
}

/** Body text. Pass `muted` for secondary copy. */
export function Text({ muted, className, ...props }: TextProps) {
  return (
    <p
      className={cn(muted ? "text-muted" : "text-foreground", className)}
      {...props}
    />
  );
}
