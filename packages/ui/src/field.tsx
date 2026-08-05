import type { LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

/** Form label. */
export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={cn("text-xs font-semibold text-muted", className)}
      {...props}
    />
  );
}

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Labelled form field: a label stacked over its control, with hint/error. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
