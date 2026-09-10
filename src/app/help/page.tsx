import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PublicShell } from "@/components/common/public-shell";
import { Notice } from "@/components/ui/stat";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Bantuan & Prosedur — ${BRAND.name}`,
  description: "Prosedur operasional yang harus dijalankan agar catatan di aplikasi cocok dengan kenyataan di outlet.",
};

/* PRD §3 pairs every product feature with a "required operating procedure".
 * The software only works when those procedures are followed, so the help page
 * is written around them rather than around buttons. */

const SOP = [
  {
    title: "Terima cucian",
    steps: [
      "Timbang di depan pelanggan, masukkan berat aktual dalam gram.",
      "Konfirmasikan minimum dan pembulatan sebelum menekan simpan — harga terkunci saat order dibuat.",
      "Tempel label kantong sesuai kode yang tercetak, satu kode untuk satu kantong.",
      "Cetak atau kirim struk. Gagal cetak tidak membatalkan order yang sudah tersimpan.",
    ],
  },
  {
    title: "Kerjakan dan periksa",
    steps: [
      "Ambil pekerjaan dengan batas waktu terdekat, bukan yang paling mudah.",
      "Geser satu tahap setiap kali pekerjaan benar-benar berpindah, bukan di akhir shift.",
      "Saat QC, cocokkan jumlah kantong dan kondisi; jangan membandingkan berat basah awal dengan berat akhir sebagai bukti kehilangan.",
      "Isi nomor rak sebelum menandai siap diambil, supaya paket bisa ditemukan.",
    ],
  },
  {
    title: "Terima pembayaran",
    steps: [
      "Tunai: catat uang yang diterima; kelebihan adalah kembalian, bukan pembayaran.",
      "Transfer/QRIS: statusnya menunggu verifikasi. Tangkapan layar bukan bukti — cek mutasi rekening sendiri.",
      "Perbaikan catatan memakai pembalikan atau refund, tidak pernah dengan menghapus.",
    ],
  },
  {
    title: "Serahkan cucian",
    steps: [
      "Pastikan seluruh pekerjaan sudah siap dan tidak ada isu yang memblokir.",
      "Hitung semua paket di depan pelanggan; P0 tidak melayani pengambilan sebagian.",
      "Bila masih ada sisa tagihan, pelepasan butuh persetujuan owner/supervisor beserta alasannya. Piutang tetap tercatat.",
      "Catat nama penerima fisik, dan tandai bila yang mengambil adalah perwakilan.",
    ],
  },
  {
    title: "Tutup laci kas",
    steps: [
      "Hitung uang fisik lebih dulu, baru bandingkan dengan angka sistem.",
      "Transfer dan QRIS tidak menambah uang di laci — jangan dimasukkan ke hitungan kas.",
      "Selisih tidak boleh diubah menjadi pengeluaran dan tidak boleh dihapus. Tulis keterangan, lalu supervisor meninjau.",
    ],
  },
];

export default function HelpPage() {
  return (
    <PublicShell
      eyebrow="Panduan Operasional"
      title="Prosedur dulu, aplikasi menyusul"
      lead="Aplikasi hanya bekerja bila pelabelan, pemeriksaan, dan pencatatan benar-benar dijalankan. Berikut prosedur minimum yang diasumsikan oleh setiap layar."
    >
      <div className="grid gap-6 md:grid-cols-2">
        {SOP.map((block, i) => (
          <Card key={block.title} pad="lg" className="space-y-4">
            <span className="num font-mono text-[11px] font-bold text-ink-faint">0{i + 1}</span>
            <h2 className="text-lg font-bold tracking-tight">{block.title}</h2>
            <ol className="space-y-2.5">
              {block.steps.map((step) => (
                <li key={step} className="flex gap-2.5 text-xs leading-relaxed text-ink-soft">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-faint" />
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>

      <Notice tone="warning">
        <span className="block font-bold">Yang tidak dijanjikan {BRAND.name}</span>
        <span>
          Aplikasi ini tidak menghilangkan kehilangan barang atau kecurangan, tidak membuat inventaris per helai dari
          foto awal, dan tidak menjamin setiap printer Bluetooth bekerja. Yang bisa dibuktikan adalah: order lebih
          mudah ditelusuri, batas waktu terlihat, hitungan bisa diperiksa, dan selisih kas bisa diusut.
        </span>
      </Notice>

      <Card pad="lg" className="space-y-2">
        <h2 className="text-lg font-bold tracking-tight">Butuh bantuan lain?</h2>
        <p className="text-xs leading-relaxed text-ink-muted">
          Hubungi supervisor outlet Anda lebih dulu untuk urusan operasional harian. Untuk kendala akun, mulai dari{" "}
          <Link href="/reset-password" className="font-bold text-ink underline-offset-4 hover:underline">
            pemulihan kata sandi
          </Link>
          . Tim dukungan hanya bisa membuka data Anda dengan izin bertenggat waktu dan alasan yang tercatat.
        </p>
      </Card>
    </PublicShell>
  );
}
