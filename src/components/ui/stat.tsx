import * as React from "react";
import { cn } from "@/lib/utils";

/* Big geometric number displays + the label/value row used across summaries. */

const CIRCLE_TONE = {
  outline: "border border-line-strong bg-surface text-ink",
  accent: "bg-accent text-ink",
  ink: "bg-ink text-white",
} as const;

const CIRCLE_SIZE = { sm: "size-40", md: "size-44 sm:size-48", lg: "size-48 sm:size-52" } as const;

export function StatCircle({
  value,
  unit,
  caption,
  tone = "outline",
  size = "md",
}: {
  value: React.ReactNode;
  unit: string;
  caption?: string;
  tone?: keyof typeof CIRCLE_TONE;
  size?: keyof typeof CIRCLE_SIZE;
}) {
  return (
    <div className="flex max-w-[210px] flex-col items-center space-y-4 text-center">
      <div
        className={cn(
          "hover-lift flex flex-col items-center justify-center rounded-full p-6 shadow-card",
          CIRCLE_TONE[tone],
          CIRCLE_SIZE[size]
        )}
      >
        <span className="num text-3xl font-extrabold tracking-tight sm:text-4xl">{value}</span>
        <span className={cn("mt-1 text-xs font-semibold", tone === "ink" ? "text-white/70" : "opacity-70")}>
          {unit}
        </span>
      </div>
      {caption && <p className="text-xs leading-normal text-ink-muted">{caption}</p>}
    </div>
  );
}

/** Oversized editorial number for impact stats. */
export function BigStat({
  label,
  value,
  unit,
  footnote,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  footnote?: string;
}) {
  return (
    <div className="space-y-3">
      <span className="text-xs font-semibold text-ink-muted">{label}</span>
      <div className="num text-6xl font-extrabold leading-none tracking-tighter sm:text-8xl">
        {value}
        {unit && <span className="text-3xl font-medium tracking-tight text-ink-faint sm:text-5xl"> {unit}</span>}
      </div>
      {footnote && <span className="eyebrow block pt-1">{footnote}</span>}
    </div>
  );
}

/** Compact KPI tile for dashboards. */
export function StatTile({
  label,
  value,
  hint,
  emphasis = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  emphasis?: "default" | "positive" | "negative" | "primary";
}) {
  const valueTone = {
    default: "text-ink",
    positive: "text-ok",
    negative: "text-danger",
    primary: "text-ink",
  }[emphasis];

  return (
    <div
      className={cn(
        "rounded-card border p-6 shadow-card",
        emphasis === "primary" ? "border-ink bg-ink text-white" : "border-line bg-surface"
      )}
    >
      <span
        className={cn(
          "block text-[11px] font-bold uppercase tracking-wider",
          emphasis === "primary" ? "text-white/60" : "text-ink-faint"
        )}
      >
        {label}
      </span>
      <div
        className={cn(
          "num mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl",
          emphasis === "primary" ? "text-white" : valueTone
        )}
      >
        {value}
      </div>
      {hint && (
        <p className={cn("mt-3 text-xs leading-relaxed", emphasis === "primary" ? "text-white/60" : "text-ink-muted")}>
          {hint}
        </p>
      )}
    </div>
  );
}

/** label — value row. The workhorse of every summary panel and receipt. */
export function DataRow({
  label,
  value,
  strong,
  tone = "default",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
  tone?: "default" | "positive" | "warning" | "negative";
  className?: string;
}) {
  const valueTone = {
    default: "text-ink",
    positive: "text-ok",
    warning: "text-warn",
    negative: "text-danger",
  }[tone];

  return (
    <div className={cn("flex items-center justify-between gap-4 text-sm", className)}>
      <span className={cn("text-ink-muted", strong && "font-bold text-ink")}>{label}</span>
      <span className={cn("num text-right font-semibold", strong && "text-base font-extrabold", valueTone)}>
        {value}
      </span>
    </div>
  );
}

/** Inline callout for warnings / confirmations inside forms and modals. */
export function Notice({
  tone = "info",
  icon,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tones = {
    info: "bg-sunken border-line text-ink-soft",
    success: "bg-ok-soft border-ok/20 text-ok",
    warning: "bg-warn-soft border-warn/20 text-warn",
    danger: "bg-danger-soft border-danger/20 text-danger",
  }[tone];

  return (
    <div className={cn("flex gap-3 rounded-control border p-4 text-xs leading-relaxed", tones)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="space-y-1">{children}</div>
    </div>
  );
}
