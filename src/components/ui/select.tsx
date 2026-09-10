"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Pilih…",
  id,
  className,
  disabled,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50/60 px-4 text-left text-sm font-semibold text-neutral-900 transition-all outline-none",
          "focus:ring-2 focus:ring-black focus:bg-white",
          "data-[placeholder]:font-normal data-[placeholder]:text-neutral-400",
          "data-[state=open]:border-black data-[state=open]:bg-white data-[state=open]:ring-2 data-[state=open]:ring-black",
          disabled && "cursor-not-allowed opacity-50",
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-neutral-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={cn(
            "z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden",
            "rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-2xl",
            "origin-[var(--radix-select-content-transform-origin)]"
          )}
        >
          <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-neutral-400">
            <ChevronUp className="size-4" />
          </SelectPrimitive.ScrollUpButton>

          <SelectPrimitive.Viewport className="p-1">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className={cn(
                  "group relative flex cursor-pointer select-none items-center justify-between gap-4",
                  "rounded-xl px-3.5 py-2.5 text-xs font-medium text-neutral-800 outline-none transition-colors",
                  "data-[highlighted]:bg-black data-[highlighted]:text-white",
                  "data-[state=checked]:font-bold data-[state=checked]:text-neutral-900 data-[state=checked]:bg-neutral-100 data-[highlighted]:data-[state=checked]:text-white data-[highlighted]:data-[state=checked]:bg-black",
                  "data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
                )}
              >
                <span className="min-w-0">
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                  {opt.hint && (
                    <span className="mt-0.5 block text-[10px] font-normal text-neutral-400 group-data-[highlighted]:text-neutral-300">
                      {opt.hint}
                    </span>
                  )}
                </span>
                <SelectPrimitive.ItemIndicator>
                  <Check className="size-3.5 shrink-0" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>

          <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-neutral-400">
            <ChevronDown className="size-4" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
