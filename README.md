# LaundryFlow — SaaS Operasional Laundry Indonesia

Sistem operasi laundry modern berbasis web untuk mengontrol pencatatan kiloan/satuan, antrean mesin cuci-setrika, penataan rak fisik, verifikasi pembayaran, serta rekonsiliasi kas harian tanpa selisih.

---

## 🚀 Fitur Utama

- **POS Kasir Intake & Kalkulasi Deterministik**: Hitung berat aktual, minimum *billable* (misal min. 3.000g), kelipatan timbang 100g, dan pembulatan *round-half-up* integer Rupiah di server.
- **Snapshot Versi Harga**: Perubahan harga katalog di masa depan tidak akan merusak struk historis lama.
- **Papan Produksi & QC**: Urutan antrean berdasarkan batas waktu (SLA), pelacakan nomor kantong, dan penguncian nomor rak sebelum status *READY*.
- **Integritas 4 Dimensi Status**: Pemisahan independen antara *Siklus Order*, *Tahap Kerja Mesin*, *Keberadaan Fisik Pakaian*, dan *Status Pelunasan*.
- **Pengaman Serah Terima (Handover Guard)**: Penyerahan pakaian wajib *READY* dan lunas, atau membutuhkan izin kredit tertulis dari Supervisor/Owner.
- **Buku Besar Kasir & Rekonsiliasi Kas**:
  $$\text{Target Kas Laci} = \text{Modal Awal} + \text{Penerimaan Kas} - \text{Pengeluaran Kas} - \text{Refund Kas}$$
- **Mode Pemulihan Nota Darurat**: Pencatatan transaksi offline pasca-mati lampu tanpa menduplikasi penerimaan kas harian.
- **Cetak Struk Thermal 58mm / 80mm**: Format CSS `@media print` khusus printer kasir Bluetooth/USB.
- **Pelacakan Digital Pelanggan**: Tautan token rahasia tanpa login yang melindungi privasi kontak dan catatan internal.

---

## 👥 Matriks Hak Akses Peran (Access Roles / RBAC)

Berdasarkan arsitektur keamanan bertingkat, hak akses dipisahkan secara tegas menurut peran staf:

| Fitur / Aksi Sistem | Owner (Pemilik) | Supervisor (SPV) | Cashier (Kasir) | Operator (Lantai Produksi) | SaaS Administrator |
|---|:---:|:---:|:---:|:---:|:---:|
| **Manajemen Tenant & Langganan** | ✅ Ya | ❌ Tidak | ❌ Tidak | ❌ Tidak | Akses Billing Saja |
| **Kelola Katalog Layanan & Harga** | ✅ Ya | Izin Khusus | ❌ Tidak | ❌ Tidak | ❌ Tidak |
| **Buat Order Baru (POS Intake)** | ✅ Ya | ✅ Ya | ✅ Ya | ❌ Tidak | ❌ Tidak |
| **Lihat Kontak Nomor HP Pelanggan** | ✅ Ya | ✅ Ya | Hanya di Outlet | ❌ Tersembunyi | ❌ Tidak |
| **Update Tahap Produksi & QC/Rak** | ✅ Ya | ✅ Ya | Izin Khusus | ✅ Ya | ❌ Tidak |
| **Terima Kas Tunai & Kembalian** | ✅ Ya | ✅ Ya | ✅ Ya | ❌ Tidak | ❌ Tidak |
| **Verifikasi Transfer Bank / QRIS** | ✅ Ya | ✅ Ya | Izin Khusus | ❌ Tidak | ❌ Tidak |
| **Persetujuan Kredit (Ambil Belum Lunas)**| ✅ Ya | ✅ Ya (Limit) | ❌ Tidak | ❌ Tidak | ❌ Tidak |
| **Revisi Resmi & Refund Dana** | ✅ Ya | ✅ Ya (Limit) | Pengajuan Saja | ❌ Tidak | ❌ Tidak |
| **Serah Terima Pakaian (Handover)** | ✅ Ya | ✅ Ya | ✅ Ya | ❌ Tidak | ❌ Tidak |
| **Tutup Sesi Laci Kas (Closing Shift)** | ✅ Ya | ✅ Ya | Sesi Sendiri | ❌ Tidak | ❌ Tidak |
| **Laporan Omzet, Piutang & Ekspor CSV** | Semua Outlet | Outlet Ditugaskan | Ringkasan Sesi | ❌ Tidak Ada Akses | Support TTL (60 Menit) |

### Penjelasan Peran:
1. **Owner (Pemilik Bisnis)**: Memiliki hak penuh untuk mengelola banyak outlet (*multi-outlet*), melihat total omzet, piutang aktif, mengundang staf, mengatur harga, dan mengekspor seluruh data bisnis.
2. **Supervisor (SPV Outlet)**: Bertanggung jawab atas integritas operasional outlet, memverifikasi mutasi bank/QRIS yang masuk, menyetujui pelepasan kredit piutang, dan meninjau selisih kas saat closing.
3. **Cashier (Kasir)**: Berfokus pada pelayanan meja depan: input timbangan pelanggan, menerima uang tunai, mencetak struk, dan menyerahkan cucian yang sudah berstatus *READY*.
4. **Operator (Lantai Produksi)**: Berfokus pada penyelesaian cucian di mesin: mencuci, mengeringkan, menyetrika, pemeriksaan QC, dan menempatkan paket ke rak. **Operator tidak dapat melihat nomor telepon pelanggan atau data keuangan/saldo**.
5. **SaaS Administrator**: Tim teknis pengelola platform. Tidak memiliki akses default ke data transaksi laundry pelanggan kecuali saat diaktifkan izin darurat (*Support Access TTL 60 Menit*).

---

## 🛠️ Tech Stack

- **Framework**: Next.js (App Router, TypeScript)
- **Styling**: Tailwind CSS v4 & Lucide Icons
- **Komponen UI**: Radix UI Primitives (Design System Kustom)
- **Database & Backend**: Supabase PostgreSQL, Supabase Auth, Supabase Storage
- **Perhitungan Domain**: Integer IDR & Integer Grams (Pure Deterministic Engine)

---

## 📂 Struktur Direktori

```text
D:\hrn\laundry\
├── src/
│   ├── app/
│   │   ├── (auth)/login/          # Halaman Login Multi-Peran
│   │   ├── admin/                 # Master Data: Pelanggan, Layanan, Staf, Outlet, Kebijakan
│   │   ├── cashier/
│   │   │   ├── new-order/         # POS Kasir Intake, Mode Nota Darurat & Upload Foto
│   │   │   ├── orders/            # Daftar Order, Pelunasan, & Serah Terima Fisik
│   │   │   ├── cash-session/      # Laci Kas, Pengeluaran & Closing Rekonsiliasi
│   │   │   └── follow-up/         # Pengingat WhatsApp Cucian Menumpuk & Rework
│   │   ├── owner/                 # Dashboard Eksekutif: Omzet, Piutang, Overdue
│   │   ├── production/            # Workboard Produksi, QC & Alokasi Rak
│   │   ├── reports/               # Laporan Finansial, Ekspor CSV & Audit Log
│   │   ├── settings/              # Profil Printer Thermal, Paket SaaS, Data Exit
│   │   ├── onboarding/            # Registrasi Tenant & Outlet Baru
│   │   ├── t/[token]/             # Pelacakan Publik Digital Pelanggan
│   │   └── api/                   # 18 Endpoint API Route Handlers
│   ├── components/
│   │   ├── ui/                    # Button, Card, Select, Modal, Field, FeedbackModal
│   │   ├── cashier/               # ThermalReceiptModal, ConditionPhotoUploader
│   │   └── common/                # SubscriptionBanner
│   ├── lib/
│   │   ├── domain/                # Pricing, Ledger, Drafts, WhatsApp, Test Checks
│   │   ├── supabase/              # Server & Client Supabase Adapters
│   │   └── api/                   # Route Handler Wrapper & Error Normalizer
│   └── types/                     # Strict TypeScript Models & DTOs
└── supabase/
    ├── migrations/                # SQL Migrations (DDL, RLS, Indexes, Stored Procedures)
    └── seed.sql                   # Fixture Data Awal PRD
```

---

## ⚡ Panduan Instalasi & Menjalankan Aplikasi

### 1. Prasyarat
- Node.js versi 18+ (Disarankan Node.js 20+ atau 24 LTS)
- npm / pnpm

### 2. Instalasi Dependensi
```bash
npm install
```

### 3. Konfigurasi Environment (`.env.local`)
Buat file `.env.local` di root folder project:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Uji Mandiri Invarian Bisnis (Domain Check)
Menjalankan pengujian kalkulasi timbangan, rekonsiliasi kas, dan proteksi saldo:
```bash
npm run check:domain
```

### 5. Menjalankan Server Pengembangan
```bash
npm run dev
```
Buka browser di `http://localhost:3000`.

### 6. Build Produksi
```bash
npm run build
npm run start
```

---

## 📜 Lisensi & Dokumen Spesifikasi
Dikembangkan berdasarkan spesifikasi **`Laundry-PRD-and-System-Analysis-EN.md`** (Versi 1.3).  
Seluruh hak cipta © 2026 LaundryFlow.
