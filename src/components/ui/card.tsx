import * as React from "react";
import { cn } from "@/lib/utils";

/* Card owns its own padding so pages never hand-tune it.
   pad: sm 20/24px · md 24/32px · lg 32/40px */
const PAD = {
  none: "",
  sm: "p-5 sm:p-6",
  md: "p-6 sm:p-8",
  lg: "p-8 sm:p-10",
} as const;

const TONE = {
  surface: "bg-surface border border-line",
  sunken: "bg-sunken border border-line",
  ink: "bg-ink text-white border border-ink",
  accent: "bg-accent text-ink border border-accent",
  feature: "bg-surface border-2 border-ink shadow-lift",
  outline: "border border-line-strong",
} as const;

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  pad?: keyof typeof PAD;
  tone?: keyof typeof TONE;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, pad = "md", tone = "surface", ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-card shadow-card", TONE[tone], PAD[pad], className)}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("mb-6 space-y-1.5", className)} {...props} />
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-base font-bold tracking-tight sm:text-lg", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-xs leading-relaxed text-ink-muted", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("space-y-4", className)} {...props} />
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("mt-8 flex items-center gap-3 border-t border-line pt-6", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
