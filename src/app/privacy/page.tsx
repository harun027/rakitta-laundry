import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PublicShell } from "@/components/common/public-shell";
import { DataRow, Notice } from "@/components/ui/stat";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Privasi & Ketentuan — ${BRAND.name}`,
  description: "Data apa yang disimpan, berapa lama, dan hak apa yang dimiliki pelanggan serta pemilik bisnis.",
};

/* PRD §10.3. The document is explicit that applying UU PDP 27/2022 to this
 * business needs legal review before launch, and that the retention numbers are
 * design targets, not quoted statutory deadlines. This page must say so. */

const COLLECTED = [
  { label: "Nama pelanggan", value: "Wajib" },
  { label: "Nomor WhatsApp", value: "Opsional" },
  { label: "Catatan kondisi & foto", value: "Opsional" },
  { label: "NIK, KTP, biometrik", value: "Tidak dikumpulkan" },
];

const RETENTION = [
  { label: "Foto kondisi cucian", value: "90 hari setelah selesai, kecuali ada sengketa" },
  { label: "Tautan pelacakan", value: "30 hari setelah serah terima (maks. 180 hari)" },
  { label: "Tautan unduhan ekspor", value: "15 menit" },
  { label: "Akses tim dukungan", value: "60 menit, dengan alasan tercatat" },
  { label: "Cadangan bergilir", value: "35 hari" },
];

export default function PrivacyPage() {
  return (
    <PublicShell
      eyebrow="Privasi & Ketentuan"
      title="Data sesedikit mungkin, retensi sependek mungkin"
      lead="Halaman ini menjelaskan data apa yang disimpan untuk menjalankan operasional laundry, berapa lama, dan hak apa yang bisa dipakai pelanggan maupun pemilik bisnis."
    >
      <Notice tone="warning">
        <span className="block font-bold">Perlu tinjauan hukum sebelum peluncuran umum</span>
        <span>
          Penerapan UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi pada bisnis ini masih harus ditinjau secara
          hukum. Angka retensi di bawah adalah target desain internal, bukan kutipan tenggat undang-undang, dan
          centang persetujuan saja tidak dianggap cukup sebagai dasar pemrosesan.
        </span>
      </Notice>

      <Card pad="lg" className="space-y-6">
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold tracking-tight">Data yang dikumpulkan</h2>
          <p className="text-xs leading-relaxed text-ink-muted">
            Identitas pelanggan dijaga seminimal mungkin. Pelanggan tanpa nomor telepon tetap bisa dilayani dengan
            struk kertas.
          </p>
        </div>
        <div className="space-y-3">
          {COLLECTED.map((row) => (
            <DataRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      </Card>

      <Card pad="lg" className="space-y-6">
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold tracking-tight">Target retensi</h2>
          <p className="text-xs leading-relaxed text-ink-muted">
            Setelah penghapusan disetujui, objek aktif dihapus dalam SLA internal 7 hari. Cadangan mengikuti rotasi;
            pemulihan wajib menerapkan ulang catatan penghapusan.
          </p>
        </div>
        <div className="space-y-3">
          {RETENTION.map((row) => (
            <DataRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card pad="lg" className="space-y-3">
          <h2 className="text-lg font-bold tracking-tight">Hak pelanggan laundry</h2>
          <p className="text-xs leading-relaxed text-ink-soft">
            Meminta akses, koreksi, dan penghapusan data pribadi melalui outlet tempat cucian diterima. Identitas
            pada transaksi dapat dianonimkan bila kewajiban pencatatan mengharuskan nilainya tetap disimpan.
          </p>
          <p className="text-xs leading-relaxed text-ink-muted">
            Halaman pelacakan tidak menampilkan nomor telepon, catatan internal, foto, maupun jejak audit staf — hanya
            status, target selesai, ringkasan tagihan, dan kontak outlet.
          </p>
        </Card>

        <Card pad="lg" className="space-y-3">
          <h2 className="text-lg font-bold tracking-tight">Hak pemilik bisnis</h2>
          <p className="text-xs leading-relaxed text-ink-soft">
            Data operasional adalah milik bisnis Anda. Owner dapat meminta ekspor kapan saja; tautan unduhannya
            berumur pendek dan tercatat di audit.
          </p>
          <p className="text-xs leading-relaxed text-ink-muted">
            Berhenti berlangganan tidak langsung menghapus data. Prosedur keluar dan retensinya dijelaskan sebelum
            penghapusan dijalankan.
          </p>
        </Card>
      </div>

      <Card pad="lg" tone="sunken" className="space-y-3 shadow-none">
        <h2 className="text-lg font-bold tracking-tight">Keamanan</h2>
        <p className="text-xs leading-relaxed text-ink-soft">
          Setiap bisnis terisolasi melalui pemisahan tenant di tingkat basis data. Tim dukungan {BRAND.name} tidak
          memiliki akses default ke transaksi pelanggan; akses hanya diberikan sementara dengan alasan dan catatan
          audit. Berkas foto disimpan di penyimpanan privat, tidak pernah di bucket publik.
        </p>
      </Card>
    </PublicShell>
  );
}
