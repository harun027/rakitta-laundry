import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PublicShell } from "@/components/common/public-shell";
import { DataRow, Notice } from "@/components/ui/stat";
import { BRAND } from "@/lib/brand";
import { formatRupiah } from "@/lib/utils";

export const metadata: Metadata = {
  title: `Paket Aplikasi — ${BRAND.name}`,
  description: "Harga uji coba pilot per outlet, masa percobaan, dan aturan saat langganan dibatasi.",
};

/* PRD §19.1/§19.2. The price range is an explicitly unvalidated hypothesis, and
 * the document forbids presenting it as a market-proven number. */

const INCLUDED = [
  "Order kiloan dan satuan dengan snapshot harga",
  "Papan produksi, QC, penataan rak, dan kode kantong",
  "Pembayaran, verifikasi transfer manual, refund, dan piutang",
  "Sesi laci kas, pengeluaran, dan rekonsiliasi harian",
  "Struk digital dan pelacakan pelanggan tanpa login",
  "Catatan audit dan ekspor data milik Anda sendiri",
];

const SEPARATE_COST = [
  "WhatsApp Business Platform resmi (P1)",
  "Penyimpanan foto melebihi kuota wajar",
  "Integrasi perangkat keras dan printer khusus",
  "Migrasi data historis yang butuh tenaga kerja nyata",
];

export default function PlansPage() {
  return (
    <PublicShell
      eyebrow="PRD §19.1 · Hipotesis Harga"
      title="Paket uji coba, bukan daftar harga final"
      lead="Angka di bawah adalah rentang yang sedang diuji bersama outlet pilot. Belum ada bukti bahwa ini harga pasar yang tepat, dan kami tidak memungut potongan persentase dari transaksi laundry Anda."
    >
      <div className="grid gap-6 md:grid-cols-3">
        <Card pad="lg" className="space-y-4">
          <span className="eyebrow block">Masa Percobaan</span>
          <div className="num text-5xl font-extrabold tracking-tight">14 hari</div>
          <p className="text-xs leading-relaxed text-ink-muted">
            Ruang lingkup dan durasi dukungan ditulis di awal. Satu outlet, fitur inti P0.
          </p>
        </Card>

        <Card pad="lg" tone="feature" className="space-y-4">
          <span className="eyebrow block">Langganan per Outlet</span>
          <div className="num text-3xl font-extrabold tracking-tight sm:text-4xl">
            {formatRupiah(79000)}–{formatRupiah(149000)}
          </div>
          <p className="text-xs leading-relaxed text-ink-muted">
            Per outlet per bulan. Rentang pengujian, bukan harga yang sudah tervalidasi pasar.
          </p>
        </Card>

        <Card pad="lg" className="space-y-4">
          <span className="eyebrow block">Masa Tenggang</span>
          <div className="num text-5xl font-extrabold tracking-tight">7 hari</div>
          <p className="text-xs leading-relaxed text-ink-muted">
            Setelah tenggang berakhir, order baru diblokir — order berjalan tetap bisa diselesaikan.
          </p>
        </Card>
      </div>

      <Card pad="lg" className="space-y-6">
        <h2 className="text-xl font-bold tracking-tight">Sudah termasuk</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {INCLUDED.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-ok" />
              <span className="leading-relaxed text-ink-soft">{item}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card pad="lg" className="space-y-6">
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold tracking-tight">Biaya terpisah</h2>
          <p className="text-xs leading-relaxed text-ink-muted">
            Kami tidak menjanjikan pemakaian tanpa batas tanpa bukti. Hal berikut ditagih terpisah dan disepakati
            sebelum dikerjakan.
          </p>
        </div>
        <div className="space-y-3">
          {SEPARATE_COST.map((item) => (
            <DataRow key={item} label={item} value="Sesuai kesepakatan" />
          ))}
        </div>
      </Card>

      <Notice tone="info">
        <span className="block font-bold text-ink">Tagihan aplikasi terpisah penuh dari uang pelanggan laundry</span>
        <span>
          Pembayaran langganan {BRAND.name} tidak pernah diambil dari struk pelanggan Anda. Saat langganan dibatasi,
          data tidak dihapus: order berjalan, pembayaran, refund, laporan, dan ekspor tetap dapat diakses, begitu pula
          rework dan pengembalian barang titipan — supaya penagihan aplikasi tidak menyandera barang pelanggan.
        </span>
      </Notice>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/onboarding">Mulai Uji Coba</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/help">Baca Panduan Operasional</Link>
        </Button>
      </div>
    </PublicShell>
  );
}
