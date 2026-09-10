import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Layers,
  PackageSearch,
  Shirt,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container, PageBody, PageShell, Section, SectionHead } from "@/components/ui/layout";
import { DataRow, Notice, StatCircle } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { BRAND } from "@/lib/brand";
import { formatRupiah, formatWeight } from "@/lib/utils";

/* Content rule for this page: the PRD forbids outcome claims it has not measured
 * ("Do not claim 100% loss prevention", targets are "not an achieved result").
 * Everything below is either a rule from the document or a worked fixture. */

/** PRD §8.1 job-based navigation. `built` reflects what exists in this prototype. */
const WORKSPACES = [
  {
    area: "Kasir & POS",
    href: "/cashier/new-order",
    icon: ShoppingBag,
    who: "Kasir · Supervisor",
    content: "Order baru, cari order, pembayaran, serah terima, sesi kas",
    refs: "FR08–FR15 · FR21–FR27",
    built: true,
  },
  {
    area: "Lantai Produksi",
    href: "/production",
    icon: Layers,
    who: "Operator",
    content: "Antrean, tahap kerja, QC, paket & rak, isu/rework",
    refs: "FR16–FR20",
    built: true,
  },
  {
    area: "Sesi Laci Kas",
    href: "/cashier/cash-session",
    icon: Banknote,
    who: "Kasir · Supervisor",
    content: "Buka/tutup kas, pengeluaran, verifikasi, refund, persetujuan",
    refs: "FR25–FR29",
    built: true,
  },
  {
    area: "Ikhtisar Owner",
    href: "/owner",
    icon: Sparkles,
    who: "Owner · Direktur",
    content: "Keterlambatan, siap-belum-diambil, piutang, kas hari ini",
    refs: "PRD §8.1 & §22.2",
    built: true,
  },
  {
    area: "Administrasi Outlet",
    href: "/admin",
    icon: Shirt,
    who: "Owner · Admin",
    content: "Katalog layanan, harga bersnapshot, data staf, outlet",
    refs: "FR01–FR07",
    built: true,
  },
  {
    area: "Pelacakan Pelanggan",
    href: "/t/demo-tracking",
    icon: PackageSearch,
    who: "Pelanggan",
    content: "Tautan rahasia tanpa login, ringkasan status, kontak outlet",
    refs: "FR33–FR35",
    built: true,
  },
];

/** PRD §22.2 — W0 pages that this prototype has not built yet. */
const NOT_BUILT = [
  "Ikhtisar owner: keterlambatan, siap-belum-diambil, piutang, kas hari ini",
  "Administrasi: pelanggan, layanan & harga, staf, outlet, kebijakan",
  "Laporan: operasi, drill-down, ekspor CSV, audit",
  "Akun: login, undangan staf, onboarding usaha, ganti outlet",
  "Pengaturan: cetak struk 58/80 mm & A4, langganan, ekspor keluar",
];

/** PRD §5.3 workflow snapshots + §9.3 rate rules. */
const SERVICES = [
  {
    name: "Setrika Saja",
    tagline: "Untuk pakaian bersih yang perlu dirapikan",
    icon: Shirt,
    priceIdr: 6000,
    unit: "kg",
    slaHours: 24,
    minGrams: 2000,
    flow: "Antrean → Setrika → QC → Siap",
    featured: false,
  },
  {
    name: "Cuci Setrika Reguler",
    tagline: "Layanan kiloan yang paling sering dipakai",
    icon: Layers,
    priceIdr: 8000,
    unit: "kg",
    slaHours: 48,
    minGrams: 3000,
    flow: "Antrean → Cuci → Kering → Setrika → QC → Siap",
    featured: true,
  },
  {
    name: "Cuci Setrika Express",
    tagline: "Tarif terpisah, bukan biaya tambahan",
    icon: Sparkles,
    priceIdr: 15000,
    unit: "kg",
    slaHours: 24,
    minGrams: 3000,
    flow: "Antrean → Cuci → Kering → Setrika → QC → Siap",
    featured: false,
  },
];

/** PRD §6.1 — the four dimensions that must never collapse into one status. */
const STATUS_DIMENSIONS = [
  {
    title: "Siklus Order",
    values: "DRAFT · ACTIVE · CANCELLED",
    note: "Pembatalan tetap menyimpan catatan anaknya, tidak menghapus riwayat.",
  },
  {
    title: "Tahap Kerja",
    values: "QUEUED → … → QC → READY",
    note: "Mengikuti snapshot alur kerja saat work item dibuat, bukan alur terbaru.",
  },
  {
    title: "Fisik Pakaian",
    values: "IN_CUSTODY · HANDED_OVER · RETURNED_ON_CANCEL",
    note: "Siap diambil bukan berarti sudah diserahkan.",
  },
  {
    title: "Status Pembayaran",
    values: "UNPAID · PARTIAL · SETTLED · CREDIT_DUE · ZERO_CHARGE",
    note: "Diturunkan dari C − N. Tidak pernah jadi tombol yang bisa ditekan manual.",
  },
];

/** PRD §4.2 — explicitly outside the P0 operational beta. */
const OUT_OF_SCOPE = [
  { label: "Transaksi offline penuh", when: "P1", note: "P0 online-first dengan prosedur struk darurat" },
  { label: "Serah terima sebagian", when: "P1", note: "P0 melepas seluruh paket sekaligus" },
  { label: "WhatsApp otomatis resmi", when: "P1", note: "P0 hanya menyiapkan pesan, klik oleh staf" },
  { label: "Gateway pembayaran laundry", when: "P1", note: "P0 verifikasi transfer manual oleh staf" },
  { label: "Antar-outlet & workshop terpusat", when: "P2", note: "P0 diproses di outlet penerima" },
  { label: "Lacak per helai & RFID", when: "P2", note: "Foto awal bukan inventaris per potong" },
];

/** PRD §9.3 main pricing fixture — every number here is checked by `npm run check:domain`. */
const FIXTURE = {
  actualGrams: 2350,
  minGrams: 3000,
  incrementGrams: 100,
  rateIdr: 8000,
  billableGrams: 3000,
  subtotalIdr: 24000,
  discountIdr: 2000,
  totalChargesIdr: 22000,
  depositIdr: 10000,
  balanceIdr: 12000,
  tenderedIdr: 20000,
  changeIdr: 8000,
};

const HERO_LINKS = [
  { href: "/cashier/new-order", icon: ShoppingBag, title: "Terminal Kasir", sub: "Timbang, harga, DP" },
  { href: "/production", icon: Layers, title: "Papan Produksi", sub: "Urut batas waktu" },
];

export default function HomePage() {
  return (
    <PageShell>
      {/* 00 — META HEADER */}
      <div className="border-b border-line bg-surface">
        <Container className="flex flex-col justify-between gap-8 py-10 md:flex-row md:items-end">
          <div className="max-w-2xl space-y-2">
            <span className="eyebrow">{BRAND.status}</span>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              {BRAND.name} — {BRAND.tagline}
            </h1>
            <p className="pt-1 text-sm leading-relaxed text-ink-muted">{BRAND.positioning}</p>
          </div>

          <dl className="flex shrink-0 gap-10 text-xs">
            <div>
              <dt className="eyebrow mb-1 block">Sasaran Awal</dt>
              <dd className="font-bold">Laundry 1–3 outlet</dd>
            </div>
            <div>
              <dt className="eyebrow mb-1 block">Lingkup Rilis</dt>
              <dd className="font-bold">P0 · Beta operasional</dd>
            </div>
          </dl>
        </Container>
      </div>

      <PageBody className="sm:space-y-24">
        {/* 01 — HERO */}
        <section className="relative flex min-h-[500px] flex-col justify-between overflow-hidden rounded-card bg-gradient-to-br from-[#121c24] via-[#1c2e3d] to-[#59483b] p-8 text-white shadow-monolith sm:min-h-[560px] sm:p-14">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-black/25 to-black/65" />

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-full bg-white text-sm font-black tracking-tighter text-ink">
                {BRAND.mark}
              </div>
              <span className="text-lg font-extrabold tracking-tight">{BRAND.name}</span>
            </div>

            <nav className="glass-dark hidden items-center gap-5 rounded-full px-6 py-2.5 text-xs font-medium text-white/90 md:flex">
              <Link href="/cashier/new-order" className="transition-colors hover:text-white">Kasir</Link>
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
                <Link href="/login">Masuk</Link>
              </Button>
              <Button asChild variant="invert" size="sm">
                <Link href="/onboarding">Daftar Outlet</Link>
              </Button>
            </div>
          </div>

          <div className="relative z-10 my-12 max-w-3xl space-y-5">
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
                Perangkat lunak hanya bekerja bila prosedur pelabelan, pemeriksaan, dan pencatatan dijalankan.{" "}
                {BRAND.name} tidak menjanjikan hilangnya kecurangan atau barang.
              </p>
            </div>
          </div>
        </section>

        {/* 02 — FIXTURE HARGA */}
        <Section>
          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <SectionHead
                eyebrow="PRD §9.1 & §9.3"
                size="lg"
                title={
                  <>
                    Hitungan yang
                    <br />
                    bisa diperiksa
                  </>
                }
                description="Berat aktual disimpan apa adanya; yang ditagih adalah hasil pembulatan ke atas terhadap minimum dan kelipatan. Rupiah dihitung sebagai bilangan bulat di server, bukan pecahan biner di browser."
              />
              <div className="mt-8 grid grid-cols-2 gap-4 sm:max-w-md">
                <Card pad="sm" tone="sunken" className="shadow-none">
                  <span className="eyebrow block">Rumus tagihan</span>
                  <code className="num mt-2 block font-mono text-[11px] leading-relaxed">
                    ceil(max(aktual, min) / kelipatan) × kelipatan
                  </code>
                </Card>
                <Card pad="sm" tone="sunken" className="shadow-none">
                  <span className="eyebrow block">Rumus saldo</span>
                  <code className="num mt-2 block font-mono text-[11px] leading-relaxed">
                    saldo = C − N
                  </code>
                </Card>
              </div>
            </div>

            <div className="grid grid-cols-1 justify-items-center gap-10 sm:grid-cols-3 sm:gap-6 lg:col-span-7">
              <StatCircle
                value={formatWeight(FIXTURE.billableGrams)}
                unit="berat ditagih"
                caption={`Dari berat aktual ${formatWeight(FIXTURE.actualGrams)}, minimum ${formatWeight(
                  FIXTURE.minGrams
                )}.`}
                size="sm"
              />
              <StatCircle
                value={formatRupiah(FIXTURE.totalChargesIdr)}
                unit="total tagihan (C)"
                caption={`Subtotal ${formatRupiah(FIXTURE.subtotalIdr)} dikurangi diskon tetap ${formatRupiah(
                  FIXTURE.discountIdr
                )}.`}
                tone="accent"
              />
              <StatCircle
                value="C − N"
                unit="saldo diturunkan"
                caption="Status lunas dihitung dari ledger, bukan dari tombol yang ditekan kasir."
                tone="ink"
                size="lg"
              />
            </div>
          </div>

          <Card pad="lg" className="mt-4">
            <div className="grid gap-x-12 gap-y-4 md:grid-cols-2">
              <DataRow label="Berat aktual di timbangan" value={formatWeight(FIXTURE.actualGrams)} />
              <DataRow label="Minimum layanan" value={formatWeight(FIXTURE.minGrams)} />
              <DataRow label={`Kelipatan ${FIXTURE.incrementGrams} g → ditagih`} value={formatWeight(FIXTURE.billableGrams)} />
              <DataRow label={`Tarif ${formatRupiah(FIXTURE.rateIdr)}/kg → subtotal`} value={formatRupiah(FIXTURE.subtotalIdr)} />
              <DataRow label="Diskon tetap" value={`− ${formatRupiah(FIXTURE.discountIdr)}`} />
              <DataRow label="Total tagihan (C)" value={formatRupiah(FIXTURE.totalChargesIdr)} strong />
              <DataRow label="DP tunai (N)" value={formatRupiah(FIXTURE.depositIdr)} tone="positive" />
              <DataRow label="Sisa tagihan" value={formatRupiah(FIXTURE.balanceIdr)} strong tone="warning" />
              <DataRow
                label={`Pelanggan menyerahkan ${formatRupiah(FIXTURE.tenderedIdr)}`}
                value={`Struk ${formatRupiah(FIXTURE.balanceIdr)} · kembali ${formatRupiah(FIXTURE.changeIdr)}`}
                className="md:col-span-2"
              />
            </div>
            <p className="mt-6 border-t border-line pt-5 text-[11px] leading-relaxed text-ink-muted">
              Angka di atas adalah fixture PRD §9.3 dan diuji ulang setiap kali menjalankan{" "}
              <code className="font-mono font-bold text-ink">npm run check:domain</code>.
            </p>
          </Card>
        </Section>

        {/* 03 — EMPAT STATUS */}
        <Section divided>
          <SectionHead
            eyebrow="PRD §6.1"
            size="lg"
            title="Empat status yang tidak boleh disatukan"
            actions={
              <p className="max-w-md text-sm leading-relaxed text-ink-muted">
                Satu label “Selesai” tidak boleh mewakili siklus order, tahap kerja, keberadaan fisik pakaian, dan
                pembayaran sekaligus. Badge yang benar berbunyi “Siap Diambil · Belum Bayar”.
              </p>
            }
          />

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STATUS_DIMENSIONS.map((d, i) => (
              <Card key={d.title} className="hover-lift flex flex-col justify-between">
                <div className="space-y-4">
                  <span className="num font-mono text-[11px] font-bold text-ink-faint">
                    0{i + 1}
                  </span>
                  <h3 className="text-lg font-bold tracking-tight">{d.title}</h3>
                  <p className="num font-mono text-[11px] leading-relaxed text-ink-soft">{d.values}</p>
                </div>
                <p className="mt-8 border-t border-line pt-5 text-xs leading-relaxed text-ink-muted">{d.note}</p>
              </Card>
            ))}
          </div>
        </Section>

        {/* 04 — RUANG KERJA */}
        <Section divided>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-4">
              <SectionHead
                eyebrow="PRD §8.1"
                size="lg"
                title={
                  <>
                    Navigasi
                    <br />
                    per pekerjaan
                  </>
                }
                description="Bukan menu per modul. Kasir, operator produksi, dan pemilik melihat isi yang berbeda karena pertanyaannya memang berbeda."
              />
            </div>

            <ul className="divide-y divide-line lg:col-span-8">
              {WORKSPACES.map((w) => (
                <li key={w.area}>
                  <Link
                    href={w.href}
                    className="group flex items-center justify-between gap-6 rounded-card px-4 py-7 transition-colors hover:bg-sunken sm:px-6"
                  >
                    <span className="min-w-0 space-y-1.5">
                      <span className="block text-2xl font-bold tracking-tight transition-transform duration-300 group-hover:translate-x-3 sm:text-3xl">
                        {w.area}
                      </span>
                      <span className="block text-xs text-ink-muted">{w.content}</span>
                      <span className="eyebrow block">
                        {w.who} · {w.refs}
                      </span>
                    </span>
                    <span className="grid size-12 shrink-0 place-items-center rounded-full border border-line-strong transition-colors group-hover:border-ink group-hover:bg-ink group-hover:text-white">
                      <ArrowRight className="size-5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <Notice tone="info">
            <span className="block font-bold text-ink">Halaman W0 yang belum dibangun di prototipe ini</span>
            <ul className="mt-1.5 list-inside list-disc space-y-1">
              {NOT_BUILT.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Notice>
        </Section>

        {/* 05 — KATALOG */}
        <Section divided>
          <SectionHead
            eyebrow="PRD §5.3 & §9.1"
            title="Katalog layanan & alur kerja"
            size="lg"
            actions={
              <p className="max-w-md text-sm leading-relaxed text-ink-muted">
                Alur kerja disimpan sebagai snapshot saat work item dibuat. Mengubah layanan hari ini tidak mengubah
                pekerjaan yang sudah berjalan, dan tidak mengubah struk lama.
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
                      Per {svc.unit === "kg" ? "kilogram" : "potong"} · SLA {svc.slaHours} jam kalender
                    </div>
                  </div>
                </div>

                <div className="mt-10 space-y-2 border-t border-line pt-6">
                  <div className="num flex items-center justify-between text-xs font-bold">
                    <span>Minimum {formatWeight(svc.minGrams)}</span>
                    <span className="font-mono text-[11px] text-ink-faint">kelipatan 100 g</span>
                  </div>
                  <p className="text-[11px] leading-snug text-ink-faint">{svc.flow}</p>
                </div>
              </Card>
            ))}
          </div>

          <p className="text-xs leading-relaxed text-ink-muted">
            SLA dihitung dalam jam kalender berjalan; hari libur tidak otomatis dikecualikan. Bila hasilnya jatuh di
            luar jam pengambilan, kasir memilih waktu yang sah dan alasannya dicatat.
          </p>
        </Section>

        {/* 06 — BATAS LINGKUP */}
        <Section divided>
          <SectionHead
            eyebrow="PRD §4.2"
            title="Yang belum ada di P0"
            size="lg"
            actions={
              <p className="max-w-md text-sm leading-relaxed text-ink-muted">
                Ditulis terbuka supaya calon pilot bisa menolak lebih awal. Kalau salah satu dari ini wajib bagi
                sebagian besar calon, ruang lingkupnya yang harus direvisi — bukan disamarkan.
              </p>
            }
          />

          <div className="grid grid-cols-1 gap-x-10 gap-y-0 md:grid-cols-2">
            {OUT_OF_SCOPE.map((s) => (
              <div key={s.label} className="flex items-start justify-between gap-6 border-b border-line py-6">
                <div className="min-w-0">
                  <div className="text-base font-bold tracking-tight">{s.label}</div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">{s.note}</p>
                </div>
                <Badge variant={s.when === "P1" ? "muted" : "outline"}>{s.when}</Badge>
              </div>
            ))}
          </div>
        </Section>

        {/* 07 — PAKET LANGGANAN */}
        <Section divided>
          <SectionHead
            eyebrow="PRD §19.1 & §19.2"
            title="Paket uji coba"
            size="lg"
            description="Hipotesis harga untuk pilot, belum tervalidasi pasar. Tagihan langganan terpisah penuh dari uang pelanggan laundry."
          />

          <div className="grid gap-6 md:grid-cols-3">
            <Card pad="lg" className="space-y-5">
              <span className="eyebrow block">Masa uji coba</span>
              <div className="num text-5xl font-extrabold tracking-tight">14 hari</div>
              <p className="text-xs leading-relaxed text-ink-muted">
                Diikuti masa tenggang 7 hari. Setelah tenggang, order baru diblokir tetapi order berjalan tetap bisa
                diselesaikan, dibayar, dan diekspor.
              </p>
            </Card>

            <Card pad="lg" tone="feature" className="space-y-5">
              <span className="eyebrow block">Langganan per outlet</span>
              <div className="num text-4xl font-extrabold tracking-tight sm:text-5xl">
                {formatRupiah(79000)}–{formatRupiah(149000)}
              </div>
              <p className="text-xs leading-relaxed text-ink-muted">
                Per outlet per bulan. Rentang pengujian, bukan harga pasar yang sudah terbukti. Tidak ada potongan
                persentase dari transaksi laundry.
              </p>
            </Card>

            <Card pad="lg" className="space-y-5">
              <span className="eyebrow block">Saat langganan dibatasi</span>
              <div className="num text-5xl font-extrabold tracking-tight">Data tetap</div>
              <p className="text-xs leading-relaxed text-ink-muted">
                Pembatasan tidak menghapus data. Rework dan pengembalian barang titipan tetap bisa dijalankan supaya
                penagihan aplikasi tidak menyandera barang pelanggan.
              </p>
            </Card>
          </div>
        </Section>

        {/* 08 — FOOTER */}
        <footer className="space-y-16 rounded-card bg-ink p-10 text-white shadow-monolith sm:p-16">
          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-6">
              <h2 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
                Buktikan dulu
                <br />
                di satu outlet.
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-white/60">
                Yang perlu dibuktikan bukan jumlah fitur, melainkan: order lebih mudah ditelusuri, batas waktu terlihat,
                hitungan bisa diperiksa, dan selisih kas bisa diusut. Ukur waktu dan kesalahan sebelum dan sesudah
                pemakaian.
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
                  <li><Link href="/t/demo-tracking" className="transition-colors hover:text-white">Pelacakan Pelanggan</Link></li>
                </ul>
              </div>
              <div className="space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">Arsitektur</div>
                <ul className="space-y-2.5 text-white/70">
                  <li>Next.js App Router</li>
                  <li>Supabase PostgreSQL</li>
                  <li>Rupiah bilangan bulat</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-white/10 pt-8 text-xs text-white/40">
            <p className="max-w-3xl leading-relaxed">
              Nama {BRAND.name} adalah nama kerja; ketersediaan merek dan domain belum diperiksa. Harga, target, dan
              angka pilot pada halaman ini adalah hipotesis untuk diuji, bukan hasil yang sudah tercapai.
            </p>
            <div className="flex flex-col justify-between gap-3 sm:flex-row">
              <span>© 2026 {BRAND.name}</span>
              <span>{BRAND.docVersion}</span>
            </div>
          </div>
        </footer>
      </PageBody>
    </PageShell>
  );
}
