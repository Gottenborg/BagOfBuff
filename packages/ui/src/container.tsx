import type { ElementType, HTMLAttributes } from "react";
import { cn } from "./cn";

type Size = "sm" | "md" | "lg" | "xl";

const sizes: Record<Size, string> = {
  sm: "max-w-2xl",
  md: "max-w-3xl",
  lg: "max-w-5xl",
  xl: "max-w-6xl",
};

export interface ContainerProps extends HTMLAttributes<HTMLElement> {
  size?: Size;
  /** Element/component to render as. Use `"main"` for the page landmark. */
  as?: ElementType;
}

/** Centered, width-constrained page container with responsive padding. */
export function Container({
  size = "lg",
  as: Tag = "div",
  className,
  ...props
}: ContainerProps) {
  return (
    <Tag
      className={cn("mx-auto w-full px-4 sm:px-6", sizes[size], className)}
      {...props}
    />
  );
}
