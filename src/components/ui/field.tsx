"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export { Select, type SelectOption } from "./select";

/* Visible label + control + optional hint/error. Never placeholder-as-label. */

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
}) {
  const reactId = React.useId();
  const id = children.props.id ?? reactId;
  const hintId = hint || error ? `${id}-hint` : undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="block text-xs font-bold text-ink-soft">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {React.cloneElement(children, {
        id,
        "aria-describedby": hintId,
        "aria-invalid": error ? true : undefined,
      })}
      {(error || hint) && (
        <p
          id={hintId}
          className={cn("text-[11px] leading-snug", error ? "font-semibold text-danger" : "text-ink-muted")}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn("control", className)} {...props} />
);
Input.displayName = "Input";

/** Search input with a leading icon slot. */
export const SearchInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { icon: React.ReactNode }
>(({ className, icon, ...props }, ref) => (
  <div className={cn("relative", className)}>
    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint">{icon}</span>
    <input ref={ref} type="search" className="control rounded-full pl-11" {...props} />
  </div>
));
SearchInput.displayName = "SearchInput";

/** Checkbox drawn in our own tokens — the native one ignores them. */
export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type"> & { label: React.ReactNode }
>(({ className, label, ...props }, ref) => (
  <label className={cn("group flex cursor-pointer items-start gap-3 text-left", className)}>
    <span className="relative mt-0.5 grid shrink-0 place-items-center">
      <input ref={ref} type="checkbox" className="peer size-5 appearance-none rounded-md border border-line-strong bg-surface transition-colors checked:border-ink checked:bg-ink" {...props} />
      <Check className="pointer-events-none absolute size-3.5 scale-50 text-white opacity-0 transition-all duration-150 peer-checked:scale-100 peer-checked:opacity-100" />
    </span>
    <span className="text-xs leading-relaxed">{label}</span>
  </label>
));
Checkbox.displayName = "Checkbox";
