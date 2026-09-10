"use client";

import { useState } from "react";
import Link from "next/link";
import { formatRupiah } from "@/lib/utils";
import { 
  ArrowLeft, 
  Printer, 
  CreditCard, 
  ShieldCheck, 
  Download, 
  HelpCircle, 
  CheckCircle2, 
  Smartphone,
  FileText
} from "lucide-react";

export default function SettingsPage() {
  const [printerSize, setPrinterSize] = useState<"58mm" | "80mm" | "a4">("58mm");
  const [autoPrintOnCommit, setAutoPrintOnCommit] = useState(true);
  const [supportAccessActive, setSupportAccessActive] = useState(false);

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#111111] antialiased pb-28 selection:bg-black selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 sm:px-12 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/"
              className="size-10 rounded-full border border-neutral-200 flex items-center justify-center hover:bg-neutral-100 transition-all"
            >
              <ArrowLeft className="size-4 text-neutral-800" />
            </Link>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-neutral-900">Pengaturan Sistem, Printer & Langganan</h1>
              <p className="text-xs text-neutral-500">Hardware Profile, Entitlements & Data Exit · PRD §14.3 & §19</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-6 sm:px-12 py-10 space-y-12">
        {/* Section 1: Printer Settings */}
        <section className="p-8 sm:p-10 rounded-3xl border border-neutral-200 bg-white space-y-6 shadow-xs">
          <div className="flex items-center gap-3 text-neutral-900">
            <div className="size-10 rounded-2xl bg-neutral-100 flex items-center justify-center">
              <Printer className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Profil Printer Struk Kasir</h2>
              <p className="text-xs text-neutral-500">Mendukung printer thermal Bluetooth / USB standar kasir Indonesia (PRD §14.3)</p>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-neutral-100 text-xs sm:text-sm">
            <div>
              <label className="text-xs font-bold text-neutral-700 block mb-2">Ukuran Kertas Thermal</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "58mm", label: "58 mm (Standard Kasir Portable)" },
                  { id: "80mm", label: "80 mm (Desktop Thermal POS)" },
                  { id: "a4", label: "A4 (Faktur Dokumen Besar)" },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPrinterSize(p.id as any)}
                    className={`p-4 rounded-2xl text-left transition-all border ${
                      printerSize === p.id 
                        ? "border-black bg-black text-white shadow-md font-bold" 
                        : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                    }`}
                  >
                    <div className="text-xs font-bold">{p.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
              <div>
                <div className="font-bold text-neutral-900">Buka Dialog Cetak Otomatis</div>
                <div className="text-xs text-neutral-500">Otomatis panggil cetak saat kasir klik Konfirmasi Order</div>
              </div>
              <input 
                type="checkbox"
                checked={autoPrintOnCommit}
                onChange={(e) => setAutoPrintOnCommit(e.target.checked)}
                className="size-5 rounded"
              />
            </div>

            <div className="pt-2">
              <button 
                onClick={() => window.print()}
                className="px-5 py-2.5 rounded-full border border-neutral-300 text-xs font-bold hover:bg-black hover:text-white transition-all flex items-center gap-2"
              >
                <FileText className="size-3.5" /> Uji Cetak Struk Contoh
              </button>
            </div>
          </div>
        </section>

        {/* Section 2: SaaS Plan & Subscription */}
        <section className="p-8 sm:p-10 rounded-3xl border border-neutral-200 bg-white space-y-6 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-neutral-900">
              <div className="size-10 rounded-2xl bg-neutral-100 flex items-center justify-center">
                <CreditCard className="size-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Paket Langganan LaundryFlow</h2>
                <p className="text-xs text-neutral-500">Terpisah penuh dari rekening transaksi cucian pelanggan (PRD §19.2)</p>
              </div>
            </div>
            <span className="px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
              Trial 14 Hari Aktif
            </span>
          </div>

          <div className="p-6 rounded-2xl bg-neutral-50/80 border border-neutral-200/80 space-y-4 text-xs sm:text-sm">
            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Paket Operasional:</span>
              <span className="font-bold text-neutral-900">Professional Multi-Outlet (Hingga 3 Outlet)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Biaya Langganan:</span>
              <span className="font-bold text-neutral-900">Rp 99.000 / outlet / bulan</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Masa Percobaan Selesai:</span>
              <span className="font-mono font-bold text-neutral-800">24 September 2026</span>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs text-neutral-500">
            <span>Saat paket grace period/restricted, pengerjaan order aktif & serah terima tetap bisa diselesaikan.</span>
            <button 
              onClick={() => alert("Ekspor arsip backup seluruh database tenant")}
              className="px-5 py-2.5 rounded-full bg-neutral-100 text-neutral-900 font-bold hover:bg-neutral-200 transition-all shrink-0 flex items-center gap-1.5"
            >
              <Download className="size-3.5" /> Unduh Seluruh Data Saya (Exit)
            </button>
          </div>
        </section>

        {/* Section 3: Support Access TTL */}
        <section className="p-8 sm:p-10 rounded-3xl border border-neutral-200 bg-white space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-neutral-900">Izin Akses Bantuan Teknis (Support TTL 60 Menit)</h3>
              <p className="text-xs text-neutral-500">Buka akses sementara untuk tim teknis jika butuh investigasi kendala pembukuan (PRD §7.5 FR39).</p>
            </div>
            <button
              onClick={() => setSupportAccessActive(!supportAccessActive)}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${
                supportAccessActive 
                  ? "bg-red-600 text-white" 
                  : "bg-black text-white hover:bg-neutral-800"
              }`}
            >
              {supportAccessActive ? "Cabut Akses Bantuan" : "Aktifkan 60 Menit"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
