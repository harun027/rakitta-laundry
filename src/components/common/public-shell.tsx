import Link from "next/link";
import { Container } from "@/components/ui/layout";
import { Logo } from "@/components/ui/logo";
import { BRAND } from "@/lib/brand";

/* Shell for the pages PRD §22.2 lists under "Public": landing, application
 * plans, help, privacy/terms. No login, no tenant data. */

const NAV = [
  { href: "/plans", label: "Paket" },
  { href: "/help", label: "Bantuan" },
  { href: "/privacy", label: "Privasi" },
];

export function PublicShell({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <Container className="flex h-20 items-center justify-between gap-6">
          <Link href="/" aria-label={BRAND.name}>
            <Logo height={30} priority />
          </Link>
          <nav className="flex items-center gap-6 text-xs font-bold">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-ink-muted transition-colors hover:text-ink">
                {item.label}
              </Link>
            ))}
            <Link href="/login" className="transition-colors hover:text-ink-muted">
              Masuk
            </Link>
          </nav>
        </Container>
      </header>

      <Container width="content" className="space-y-10 py-12 pb-24 sm:py-16">
        <div className="max-w-2xl space-y-3">
          <span className="eyebrow block">{eyebrow}</span>
          <h1 className="text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">{title}</h1>
          <p className="pt-1 text-sm leading-relaxed text-ink-muted">{lead}</p>
        </div>

        {children}
      </Container>

      <footer className="border-t border-line bg-surface">
        <Container className="flex flex-col justify-between gap-3 py-8 text-[11px] text-ink-faint sm:flex-row">
          <span>© 2026 {BRAND.name}</span>
          <span>{BRAND.docVersion}</span>
        </Container>
      </footer>
    </div>
  );
}
