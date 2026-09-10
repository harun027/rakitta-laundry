"use client";

import { useState } from "react";
import Link from "next/link";
import { formatRupiah } from "@/lib/utils";
import { Select, type SelectOption } from "@/components/ui/select";
import { 
  ArrowLeft, 
  TrendingUp, 
  AlertTriangle, 
  Clock, 
  Wallet, 
  PackageCheck, 
  ShoppingBag, 
  Layers, 
  ArrowRight,
  ShieldCheck,
  Building2,
  Calendar,
  Filter,
  Download,
  ChevronRight
} from "lucide-react";

const OUTLET_FILTER_OPTIONS: SelectOption[] = [
  { value: "all", label: "Semua Outlet (4 Outlet)", hint: "Akumulasi seluruh cabang" },
  { value: "sby", label: "Surabaya Pusat (Utama)", hint: "WIB · 24 Order Aktif" },
  { value: "jkt", label: "Jakarta Selatan (Fatmawati)", hint: "WIB · 18 Order Aktif" },
  { value: "bdg", label: "Bandung Dago (Dipatiukur)", hint: "WIB · 14 Order Aktif" },
  { value: "bali", label: "Bali Seminyak (Sunset Road)", hint: "WITA · 29 Order Aktif" },
];

export default function OwnerOverviewPage() {
  const [selectedOutlet, setSelectedOutlet] = useState("all");

  const summary = {
    totalRevenueToday: 2850000,
    cashInDrawerToday: 1750000,
    transferQrisToday: 1100000,
    activeReceivables: 420000, // Total Piutang belum lunas
    overdueOrdersCount: 3,
    readyUncollectedCount: 14,
    totalKgProcessedToday: 215,
    onTimeRate: "98.4%",
  };

  const overdueList = [
    { id: "1", number: "OUT-260909-0988", customer: "Budi Santoso", service: "Setrika Saja (3,1 kg)", due: "2 jam lalu", outlet: "Surabaya Pusat" },
    { id: "2", number: "OUT-260910-1002", customer: "Siti Rahma", service: "Cuci Setrika Express (4,2 kg)", due: "30 mnt lalu", outlet: "Surabaya Pusat" },
    { id: "3", number: "OUT-260909-0955", customer: "Irfan Hakim", service: "Bedcover King (2 Pcs)", due: "1 jam lalu", outlet: "Jakarta Selatan" },
  ];

  const receivablesList = [
    { id: "1", number: "OUT-260910-1000", customer: "Hendro Wibowo", phone: "08123456789", balance: 40000, status: "READY", rack: "RAK-B03" },
    { id: "2", number: "OUT-260909-0994", customer: "Anita Wijaya", phone: "08561234567", balance: 65000, status: "HANDED_OVER", creditApprovedBy: "Harun (Owner)" },
    { id: "3", number: "OUT-260910-1008", customer: "Reza Rahardian", phone: "08198765432", balance: 25000, status: "READY", rack: "RAK-A02" },
  ];

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
              <h1 className="text-lg font-bold tracking-tight text-neutral-900">Ikhtisar Owner & Metrik Operasional</h1>
              <p className="text-xs text-neutral-500">Executive Realtime Overview · PRD §8.1 & §22.2</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-64">
            <Select
              value={selectedOutlet}
              onValueChange={setSelectedOutlet}
              options={OUTLET_FILTER_OPTIONS}
              className="h-10 text-xs font-semibold rounded-full bg-neutral-50/80 border-neutral-200"
            />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 sm:px-12 py-10 space-y-12">
        {/* 4 Big Numbers KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1 */}
          <div className="p-8 rounded-3xl border border-neutral-200 bg-white space-y-3 hover-lift shadow-xs">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 block">
              Penerimaan Uang Hari Ini
            </span>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900">
              {formatRupiah(summary.totalRevenueToday)}
            </div>
            <div className="text-xs text-neutral-500 flex justify-between pt-2 border-t border-neutral-100">
              <span>Kas Fisik: <strong>{formatRupiah(summary.cashInDrawerToday)}</strong></span>
              <span>QRIS/TRF: <strong>{formatRupiah(summary.transferQrisToday)}</strong></span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="p-8 rounded-3xl border border-neutral-200 bg-white space-y-3 hover-lift shadow-xs">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-600 block">
              Piutang Aktif (Receivables)
            </span>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-amber-600">
              {formatRupiah(summary.activeReceivables)}
            </div>
            <p className="text-xs text-neutral-500 pt-2 border-t border-neutral-100">
              Dari 7 transaksi belum lunas
            </p>
          </div>

          {/* Card 3 */}
          <div className="p-8 rounded-3xl border border-neutral-200 bg-white space-y-3 hover-lift shadow-xs">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-red-500 block">
              Antrean Lewat Deadline (Overdue)
            </span>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-red-600">
              {summary.overdueOrdersCount} <span className="text-lg font-bold text-neutral-400">Order</span>
            </div>
            <p className="text-xs text-neutral-500 pt-2 border-t border-neutral-100">
              Perlu perhatian & eskalasi mesin
            </p>
          </div>

          {/* Card 4 */}
          <div className="p-8 rounded-3xl border border-neutral-200 bg-white space-y-3 hover-lift shadow-xs">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-600 block">
              Selesai Belum Diambil Pelanggan
            </span>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900">
              {summary.readyUncollectedCount} <span className="text-lg font-bold text-neutral-400">Paket</span>
            </div>
            <p className="text-xs text-neutral-500 pt-2 border-t border-neutral-100">
              Tersimpan rapi di rak outlet
            </p>
          </div>
        </div>

        {/* 2 Column Critical Watchlists */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Overdue Orders */}
          <div className="rounded-3xl border border-neutral-200 bg-white p-8 space-y-6 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="size-5" />
                <h2 className="text-lg font-bold text-neutral-900">Pekerjaan Terlambat (Overdue)</h2>
              </div>
              <Link href="/production" className="text-xs font-bold text-neutral-500 hover:text-black flex items-center gap-1">
                Buka Papan Produksi <ChevronRight className="size-4" />
              </Link>
            </div>

            <div className="divide-y divide-neutral-100 text-xs sm:text-sm">
              {overdueList.map((item) => (
                <div key={item.id} className="py-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-neutral-900">{item.number}</span>
                      <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold text-[10px]">
                        Terlambat {item.due}
                      </span>
                    </div>
                    <div className="text-neutral-700 font-medium">{item.customer} · {item.service}</div>
                    <div className="text-[11px] text-neutral-400">{item.outlet}</div>
                  </div>
                  <Link
                    href="/production"
                    className="px-4 py-2 rounded-full border border-neutral-200 text-xs font-bold hover:bg-black hover:text-white transition-all"
                  >
                    Periksa
                  </Link>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Receivables / Piutang Belum Lunas */}
          <div className="rounded-3xl border border-neutral-200 bg-white p-8 space-y-6 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-600">
                <Wallet className="size-5" />
                <h2 className="text-lg font-bold text-neutral-900">Piutang Pelanggan</h2>
              </div>
              <Link href="/cashier/orders" className="text-xs font-bold text-neutral-500 hover:text-black flex items-center gap-1">
                Buka Serah Terima <ChevronRight className="size-4" />
              </Link>
            </div>

            <div className="divide-y divide-neutral-100 text-xs sm:text-sm">
              {receivablesList.map((item) => (
                <div key={item.id} className="py-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-neutral-900">{item.number}</span>
                      <span className="font-bold text-amber-600 font-mono">{formatRupiah(item.balance)}</span>
                    </div>
                    <div className="text-neutral-700 font-medium">{item.customer} ({item.phone})</div>
                    <div className="text-[11px] text-neutral-400">
                      {item.rack ? `Lokasi: ${item.rack}` : `Kredit disetujui: ${item.creditApprovedBy}`}
                    </div>
                  </div>
                  <Link
                    href="/cashier/orders"
                    className="px-4 py-2 rounded-full bg-neutral-100 text-neutral-800 text-xs font-bold hover:bg-black hover:text-white transition-all"
                  >
                    Tagih / Bayar
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Navigation Footer */}
        <div className="p-8 rounded-3xl bg-neutral-900 text-white flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="space-y-1 text-center sm:text-left">
            <h3 className="text-xl font-bold">Butuh Laporan Pembukuan Lengkap?</h3>
            <p className="text-xs text-neutral-400">Ekspor laporan keuangan dengan perlindungan formula CSV & log audit.</p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/reports"
              className="px-6 py-3 rounded-full bg-white text-black text-xs font-bold hover:bg-neutral-200 transition-all"
            >
              Buka Laporan & Audit
            </Link>
            <Link
              href="/admin"
              className="px-6 py-3 rounded-full glass-dark text-white text-xs font-bold hover:bg-white/20 transition-all"
            >
              Administrasi Outlet
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
