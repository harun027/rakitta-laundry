import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/* =============================================================================
   LAYOUT PRIMITIVES — the spacing system lives here, not in the pages.
   Rhythm:  container 24/40/48px gutter · section 48/64px pad · stack 64/96px gap
   ============================================================================= */

const WIDTHS = {
  narrow: "max-w-2xl",
  content: "max-w-4xl",
  wide: "max-w-6xl",
  full: "max-w-7xl",
} as const;

export function Container({
  width = "full",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { width?: keyof typeof WIDTHS }) {
  return <div className={cn("mx-auto w-full px-6 sm:px-10 lg:px-12", WIDTHS[width], className)} {...props} />;
}

export function PageShell({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-screen bg-paper text-ink", className)} {...props} />;
}

/** Sticky editorial header. Back arrow, title stack, free-form right slot. */
export function TopBar({
  title,
  subtitle,
  backHref = "/",
  actions,
  width = "full",
}: {
  title: string;
  subtitle?: string;
  backHref?: string | null;
  actions?: React.ReactNode;
  width?: keyof typeof WIDTHS;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-md">
      <Container width={width} className="flex h-20 items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {backHref && (
            <Link
              href={backHref}
              aria-label="Kembali"
              className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-ink transition-colors hover:bg-sunken press-fx"
            >
              <ArrowLeft className="size-4" />
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">{title}</h1>
            {subtitle && <p className="truncate text-xs text-ink-muted">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
      </Container>
    </header>
  );
}

/** Vertical rhythm wrapper for a page body: consistent gap between sections. */
export function PageBody({
  width = "full",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { width?: keyof typeof WIDTHS }) {
  return (
    <Container
      width={width}
      className={cn("space-y-12 py-10 pb-24 sm:space-y-16 sm:py-14", className)}
      {...props}
    />
  );
}

export function Section({
  divided,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { divided?: boolean }) {
  return (
    <section
      className={cn("space-y-6 sm:space-y-8", divided && "border-t border-line pt-12 sm:pt-16", className)}
      {...props}
    />
  );
}

/** Eyebrow + big title on the left, supporting copy or an action on the right. */
export function SectionHead({
  eyebrow,
  title,
  description,
  actions,
  size = "md",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const titleSize = {
    sm: "text-xl sm:text-2xl",
    md: "text-2xl sm:text-4xl",
    lg: "text-3xl sm:text-5xl",
  }[size];

  return (
    <div className={cn("flex flex-col gap-5 md:flex-row md:items-end md:justify-between", className)}>
      <div className="max-w-2xl space-y-2">
        {eyebrow && <span className="eyebrow block">{eyebrow}</span>}
        <h2 className={cn("font-extrabold leading-[1.08] tracking-tight", titleSize)}>{title}</h2>
        {description && <p className="pt-1 text-sm leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
