import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type Size = "sm" | "md" | "lg" | "xl";

const sizes: Record<Size, string> = {
  sm: "max-w-2xl",
  md: "max-w-3xl",
  lg: "max-w-5xl",
  xl: "max-w-6xl",
};

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: Size;
}

/** Centered, width-constrained page container with responsive padding. */
export function Container({
  size = "lg",
  className,
  ...props
}: ContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full px-4 sm:px-6", sizes[size], className)}
      {...props}
    />
  );
}
