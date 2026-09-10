import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap",
  {
    variants: {
      variant: {
        ink: "bg-ink text-white",
        accent: "bg-accent text-ink",
        outline: "border border-line-strong text-ink-muted",
        muted: "bg-sunken text-ink-soft",
        success: "bg-ok-soft text-ok",
        warning: "bg-warn-soft text-warn",
        danger: "bg-danger-soft text-danger",
      },
    },
    defaultVariants: { variant: "muted" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  tone?: "ink" | "accent" | "outline" | "muted" | "success" | "warning" | "danger" | string;
}

function Badge({ className, variant, tone, ...props }: BadgeProps) {
  const effectiveVariant = (variant || tone || "muted") as any;
  return <div className={cn(badgeVariants({ variant: effectiveVariant }), className)} {...props} />;
}

export { Badge, badgeVariants };
