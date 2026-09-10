"use client";

import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import {
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  Flame,
  Layers,
  MapPin,
  PackageSearch,
  Shirt,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container, PageBody, PageShell, Section, SectionHead } from "@/components/ui/layout";
import { StatCircle } from "@/components/ui/stat";
import { BRAND } from "@/lib/brand";
import { formatRupiah, formatWeight } from "@/lib/utils";

const WORKSPACES = [
  {
    area: "Kasir & POS Intake",
    href: "/cashier/new-order",
    icon: ShoppingBag,
    who: "Kasir · Meja Depan",
    content: "Pencatatan kiloan/satuan, timbangan otomatis, bayar DP kas/QRIS, cetak struk.",
  },
  {
    area: "Lantai Produksi & QC",
    href: "/production",
    icon: Layers,
    who: "Operator Mesin",
    content: "Antrean urut SLA deadline, transisi cuci-kering-setrika, QC, dan nomor rak.",
  },
  {
    area: "Daftar Order & Serah Terima",
    href: "/cashier/orders",
    icon: PackageSearch,
    who: "Kasir · Front Desk",
    content: "Pencarian struk, pelunasan sisa tagihan, verifikasi transfer, serah terima pakaian.",
  },
  {
    area: "Sesi Laci Kas & Closing",
    href: "/cashier/cash-session",
    icon: Banknote,
    who: "Kasir · Supervisor",
    content: "Modal awal, pengeluaran kas kecil, dan rekonsiliasi kas harian tanpa selisih.",
  },
  {
    area: "Antrean Tindak Lanjut & Rework",
    href: "/cashier/follow-up",
    icon: Clock,
    who: "Kasir · Operator",
    content: "Pengingat WhatsApp cucian mengendap >3 hari di rak dan penanganan cuci ulang.",
  },
  {
    area: "Ikhtisar Eksekutif Owner",
    href: "/owner",
    icon: Sparkles,
    who: "Pemilik Outlet",
    content: "Pantauan omzet harian, total piutang aktif, antrean terlambat multi-outlet.",
  },
  {
    area: "Administrasi & Master Data",
    href: "/admin",
    icon: Shirt,
    who: "Admin · Owner",
    content: "Manajemen data pelanggan, katalog layanan versi snapshot, staf RBAC, outlet.",
  },
  {
    area: "Laporan Keuangan & Audit Log",
    href: "/reports",
    icon: TrendingUp,
    who: "Owner · Supervisor",
    content: "Rekonsiliasi keuangan lengkap, ekspor CSV aman, dan audit trail mutlak.",
  },
];

const SERVICES = [
  {
    name: "Setrika Saja",
    tagline: "Untuk pakaian bersih yang perlu dirapikan",
    icon: Shirt,
    priceIdr: 6000,
    unit: "kg",
    slaHours: 24,
    minGrams: 2000,
    flow: "Antrean → Setrika → QC → Siap Diambil",
    featured: false,
  },
  {
    name: "Cuci Setrika Reguler",
    tagline: "Layanan harian paling lengkap dan hemat",
    icon: Layers,
    priceIdr: 8000,
    unit: "kg",
    slaHours: 48,
    minGrams: 3000,
    flow: "Cuci → Keringkan → Setrika → QC → Rak",
    featured: true,
  },
  {
    name: "Cuci Setrika Express",
    tagline: "Prioritas mesin kilat selesai 24 jam",
    icon: Flame,
    priceIdr: 15000,
    unit: "kg",
    slaHours: 24,
    minGrams: 3000,
    flow: "Antrean Prioritas → Cuci → Kering → Setrika → QC",
    featured: false,
  },
];

const HERO_LINKS = [
  { href: "/cashier/new-order", icon: ShoppingBag, title: "Terminal Kasir", sub: "Timbang, harga, DP" },
  { href: "/production", icon: Layers, title: "Papan Produksi", sub: "Urut batas waktu" },
];

export default function HomePage() {
  return (
    <PageShell>
      {/* 00 — TOP BAR */}
      <div className="border-b border-line bg-surface">
        <Container className="flex flex-col justify-between gap-6 py-8 md:flex-row md:items-center">
          <div className="space-y-1">
            <span className="eyebrow">Sistem Manajemen Laundry Terpadu</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
              Rakkita Portal Operasional
            </h1>
          </div>

          <div className="flex items-center gap-6 text-xs font-mono">
            <div>
              <span className="text-ink-faint block uppercase text-[10px]">Outlet Aktif</span>
              <span className="font-bold text-ink">Surabaya Pusat (WIB)</span>
            </div>
            <div>
              <span className="text-ink-faint block uppercase text-[10px]">Laci Kas</span>
              <span className="font-bold text-ok">Sesi Terbuka</span>
            </div>
          </div>
        </Container>
      </div>

      <PageBody className="sm:space-y-20 py-8">
        {/* 01 — HERO */}
        <section className="relative flex min-h-[480px] flex-col justify-between overflow-hidden rounded-card bg-gradient-to-br from-[#121c24] via-[#1c2e3d] to-[#59483b] p-8 text-white shadow-monolith sm:min-h-[540px] sm:p-12">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-black/25 to-black/65" />

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <Logo tone="dark" height={34} priority />

            <nav className="glass-dark hidden items-center gap-5 rounded-full px-6 py-2.5 text-xs font-medium text-white/90 md:flex">
              <Link href="/cashier/new-order" className="transition-colors hover:text-white">POS Kasir</Link>
              <Link href="/production" className="transition-colors hover:text-white">Produksi</Link>
              <Link href="/cashier/orders" className="transition-colors hover:text-white">Serah Terima</Link>
              <Link href="/cashier/cash-session" className="transition-colors hover:text-white">Laci Kas</Link>
              <Link href="/owner" className="transition-colors hover:text-white">Owner</Link>
              <Link href="/admin" className="transition-colors hover:text-white">Admin</Link>
              <Link href="/reports" className="transition-colors hover:text-white">Laporan</Link>
              <Link href="/settings" className="transition-colors hover:text-white">Setting</Link>
            </nav>

            <div className="flex items-center gap-2.5">
              <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10">
                <Link href="/login">Masuk Staf</Link>
              </Button>
              <Button asChild variant="invert" size="sm">
                <Link href="/cashier/new-order">+ Order Baru</Link>
              </Button>
            </div>
          </div>

          <div className="relative z-10 my-10 max-w-3xl space-y-4">
            <h2 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
              Setiap kantong punya jejak. Setiap rupiah punya bukti.
            </h2>
          </div>

          <div className="relative z-10 flex flex-col justify-between gap-8 border-t border-white/15 pt-8 lg:flex-row lg:items-end">
            <div className="flex flex-wrap gap-4">
              {HERO_LINKS.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="glass-dark press-fx group flex items-center gap-4 rounded-control px-5 py-4 transition-colors hover:bg-white/20"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/20 transition-colors group-hover:bg-white group-hover:text-ink">
                    <item.icon className="size-4" />
                  </span>
                  <span className="pr-2">
                    <span className="block text-xs font-bold leading-tight">{item.title}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-white/70">{item.sub}</span>
                  </span>
                </Link>
              ))}
            </div>

            <div className="max-w-md space-y-4">
              <p className="text-sm leading-relaxed text-white/80">
                Sistem operasional laundry untuk mempermudah pencatatan, mencegah cucian tertukar, dan memastikan uang kasir selalu akurat.
              </p>
            </div>
          </div>
        </section>

        {/* 02 — RUANG KERJA OPERASIONAL */}
        <Section>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-4">
              <SectionHead
                eyebrow="Akses Cepat"
                size="lg"
                title={
                  <>
                    Navigasi Ruang
                    <br />
                    Kerja Staf
                  </>
                }
                description="Dirancang sesuai peran kerja harian kasir meja depan, operator mesin produksi, supervisor, dan pemilik usaha."
              />
            </div>

            <ul className="divide-y divide-line lg:col-span-8">
              {WORKSPACES.map((w) => (
                <li key={w.area}>
                  <Link
                    href={w.href}
                    className="group flex items-center justify-between gap-6 rounded-card px-4 py-6 transition-colors hover:bg-sunken sm:px-6"
                  >
                    <span className="min-w-0 space-y-1.5">
                      <span className="block text-xl sm:text-2xl font-bold tracking-tight transition-transform duration-300 group-hover:translate-x-2">
                        {w.area}
                      </span>
                      <span className="block text-xs text-ink-muted leading-relaxed">{w.content}</span>
                      <span className="eyebrow block text-neutral-400">
                        {w.who}
                      </span>
                    </span>
                    <span className="grid size-11 shrink-0 place-items-center rounded-full border border-line-strong transition-colors group-hover:border-ink group-hover:bg-ink group-hover:text-white">
                      <ArrowRight className="size-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* 03 — KATALOG LAYANAN */}
        <Section divided>
          <SectionHead
            eyebrow="Layanan Standar"
            title="Katalog Layanan & Alur Kerja"
            size="lg"
            actions={
              <p className="max-w-md text-sm leading-relaxed text-ink-muted">
                Setiap order mengunci snapshot harga saat penerimaan. Tarif laundry terhitung otomatis berdasarkan berat aktual dan minimum layanan.
              </p>
            }
          />

          <div className="grid grid-cols-1 gap-6 pt-2 md:grid-cols-3">
            {SERVICES.map((svc) => (
              <Card
                key={svc.name}
                pad="lg"
                tone={svc.featured ? "feature" : "surface"}
                className="hover-lift relative flex flex-col justify-between"
              >
                {svc.featured && (
                  <span className="absolute -top-3 right-8 rounded-full bg-accent px-3.5 py-1 text-[10px] font-extrabold uppercase tracking-wider">
                    Paling Sering
                  </span>
                )}

                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-bold">{svc.name}</h3>
                    <p className="mt-1 text-xs text-ink-muted">{svc.tagline}</p>
                  </div>

                  <div
                    className={`grid size-14 place-items-center rounded-control ${
                      svc.featured ? "bg-ink text-white" : "bg-sunken text-ink-soft"
                    }`}
                  >
                    <svc.icon className="size-7 stroke-[1.5]" />
                  </div>

                  <div>
                    <div className="num text-4xl font-extrabold tracking-tight sm:text-5xl">
                      {formatRupiah(svc.priceIdr)}
                    </div>
                    <div className="num mt-1.5 text-xs font-medium text-ink-muted">
                      Per {svc.unit === "kg" ? "kilogram" : "potong"} · SLA {svc.slaHours} jam
                    </div>
                  </div>
                </div>

                <div className="mt-8 space-y-2 border-t border-line pt-6">
                  <div className="num flex items-center justify-between text-xs font-bold">
                    <span>Minimum {formatWeight(svc.minGrams)}</span>
                    <span className="font-mono text-[11px] text-ink-faint">kelipatan 100 g</span>
                  </div>
                  <p className="text-[11px] leading-snug text-ink-faint">{svc.flow}</p>
                </div>
              </Card>
            ))}
          </div>
        </Section>

        {/* 04 — PAKET LANGGANAN */}
        <Section divided>
          <SectionHead
            eyebrow="Biaya Layanan"
            title="Paket Operasional Outlet"
            size="lg"
            description="Tanpa potongan persentase komisi dari omzet laundry Anda. Biaya tetap transparan per outlet."
          />

          <div className="grid gap-6 md:grid-cols-3">
            <Card pad="lg" className="space-y-5">
              <span className="eyebrow block">Masa Uji Coba</span>
              <div className="num text-4xl sm:text-5xl font-extrabold tracking-tight">14 Hari</div>
              <p className="text-xs leading-relaxed text-ink-muted">
                Akses penuh tanpa biaya untuk menguji seluruh pencatatan POS kasir, antrean mesin, dan rekonsiliasi laci kas.
              </p>
            </Card>

            <Card pad="lg" tone="feature" className="space-y-5">
              <span className="eyebrow block">Langganan Outlet</span>
              <div className="num text-4xl sm:text-5xl font-extrabold tracking-tight">
                Rp 99.000
              </div>
              <p className="text-xs leading-relaxed text-ink-muted">
                Per outlet per bulan. Seluruh fitur POS kasir, pelacakan digital, ekspor CSV pembukuan, dan akun staf tanpa batas.
              </p>
            </Card>

            <Card pad="lg" className="space-y-5">
              <span className="eyebrow block">Keamanan Data</span>
              <div className="num text-4xl sm:text-5xl font-extrabold tracking-tight">100% Milik Anda</div>
              <p className="text-xs leading-relaxed text-ink-muted">
                Data transaksi dan pelanggan dapat diekspor kapan saja dalam format CSV/arsip backup mandiri.
              </p>
            </Card>
          </div>
        </Section>

        {/* 05 — FOOTER */}
        <footer className="space-y-16 rounded-card bg-ink p-10 text-white shadow-monolith sm:p-16">
          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-6">
              <h2 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
                Operasikan laundry dengan standar terbaik.
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-white/60">
                Order lebih mudah ditelusuri, batas waktu terlihat jelas, hitungan kasir transparan, dan selisih uang laci kas bisa dicegah.
              </p>
              <Button asChild variant="invert">
                <Link href="/cashier/new-order">
                  Buka Terminal Kasir <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-8 text-xs sm:grid-cols-3 lg:col-span-6">
              <div className="space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Kasir</div>
                <ul className="space-y-2.5 text-white/70">
                  <li><Link href="/cashier/new-order" className="transition-colors hover:text-white">Order Baru</Link></li>
                  <li><Link href="/cashier/orders" className="transition-colors hover:text-white">Daftar Order</Link></li>
                  <li><Link href="/cashier/cash-session" className="transition-colors hover:text-white">Laci Kas</Link></li>
                </ul>
              </div>
              <div className="space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Produksi</div>
                <ul className="space-y-2.5 text-white/70">
                  <li><Link href="/production" className="transition-colors hover:text-white">Papan Antrean</Link></li>
                  <li><Link href="/production" className="transition-colors hover:text-white">QC & Rak</Link></li>
                  <li><Link href="/cashier/follow-up" className="transition-colors hover:text-white">Pengingat WhatsApp</Link></li>
                </ul>
              </div>
              <div className="space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Manajemen</div>
                <ul className="space-y-2.5 text-white/70">
                  <li><Link href="/owner" className="transition-colors hover:text-white">Ikhtisar Owner</Link></li>
                  <li><Link href="/admin" className="transition-colors hover:text-white">Master Data</Link></li>
                  <li><Link href="/reports" className="transition-colors hover:text-white">Laporan & Audit</Link></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-white/10 pt-8 text-xs text-white/40 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span>© 2026 Rakkita. Sistem Manajemen Operasional Laundry Terpadu.</span>
            <div className="flex items-center gap-4">
              <span>Next.js App Router</span>
              <span>Supabase PostgreSQL</span>
              <span>Design System</span>
            </div>
          </div>
        </footer>
      </PageBody>
    </PageShell>
  );
}
