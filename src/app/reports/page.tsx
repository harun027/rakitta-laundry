"use client";

import { useState } from "react";
import Link from "next/link";
import { formatRupiah } from "@/lib/utils";
import { 
  ArrowLeft, 
  Download, 
  ShieldCheck, 
  Calendar, 
  Filter, 
  FileSpreadsheet, 
  History, 
  CheckCircle2, 
  AlertCircle 
} from "lucide-react";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<"finance" | "audit">("finance");
  const [dateRange, setDateRange] = useState("Hari Ini (10 Sep 2026)");

  const financialSummary = {
    totalNewOrderCharges: 2850000, // C
    totalNetReceipts: 2850000,     // N
    cashReceipts: 1750000,
    transferQrisReceipts: 1100000,
    refundsPaid: 0,
    receivablesCutoff: 420000,
    expensesPaid: 70000,
  };

  const auditEvents = [
    { id: "aud-1", time: "14:32:10 WIB", actor: "Nadia (Kasir)", action: "CREATE_ORDER", entity: "Order OUT-260910-1008", detail: "Line: Cuci Reguler (3.0kg), DP: Rp 20.000 (CASH)" },
    { id: "aud-2", time: "14:15:00 WIB", actor: "Joko (Operator)", action: "STAGE_CHANGE", entity: "WorkItem WI-104", detail: "Stage: IRONING -> QC" },
    { id: "aud-3", time: "13:40:22 WIB", actor: "Rian (SPV)", action: "CREDIT_APPROVAL", entity: "Order OUT-260909-0994", detail: "Ambil tanpa lunas (Limit Rp 65.000), Pelanggan VIP" },
    { id: "aud-4", time: "11:30:15 WIB", actor: "Nadia (Kasir)", action: "RECORD_EXPENSE", entity: "Expense EXP-01", detail: "Beli Plastik Packing Rp 45.000 dari laci kas" },
    { id: "aud-5", time: "08:00:00 WIB", actor: "Nadia (Kasir)", action: "OPEN_SESSION", entity: "CashSession CS-01", detail: "Opening Float Kas Awal: Rp 100.000" },
  ];

  const handleExportCSV = (reportType: string) => {
    // PRD T31 & §7.4: Formula Injection Prevention & UTF-8 CSV
    const csvContent = "data:text/csv;charset=utf-8," + 
      "Tanggal,Nomor Order,Pelanggan,Layanan,Total Tagihan (C),Total Bayar (N),Sisa,Metode,Status\n" +
      "2026-09-10,OUT-260910-1000,'Hendro Wibowo,Cuci Reguler 5.0kg,40000,0,40000,CASH,READY\n" +
      "2026-09-10,OUT-260910-1002,'Siti Rahma,Cuci Express 4.3kg,64500,20000,44500,TRANSFER,WASHING\n" +
      "2026-09-10,OUT-260910-1005,'Dewi Lestari,Bedcover King 1pcs,35000,35000,0,QRIS,QC\n";
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `laporan_laundryflow_${reportType}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
              <h1 className="text-lg font-bold tracking-tight text-neutral-900">Laporan Keuangan & Audit Log</h1>
              <p className="text-xs text-neutral-500">Rekonsiliasi Sumber Transaksi & Anti-Tamper Log · PRD §15 & §7.4</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleExportCSV("keuangan")}
              className="px-5 py-2.5 rounded-full bg-black text-white text-xs font-bold hover:bg-neutral-800 transition-all flex items-center gap-2 shadow-sm"
            >
              <Download className="size-3.5" /> Ekspor CSV (Aman Formula)
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 sm:px-12 py-10 space-y-10">
        {/* Sub-Nav */}
        <div className="flex gap-3 overflow-x-auto pb-2 border-b border-neutral-200">
          <button
            onClick={() => setActiveTab("finance")}
            className={`px-5 py-3 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "finance" 
                ? "bg-black text-white shadow-md" 
                : "border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <FileSpreadsheet className="size-4" />
            Laporan Operasional & Kas
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            className={`px-5 py-3 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === "audit" 
                ? "bg-black text-white shadow-md" 
                : "border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <History className="size-4" />
            Audit Trail Terproteksi
          </button>
        </div>

        {/* Tab 1: Financial & Operational Ledger Report */}
        {activeTab === "finance" && (
          <div className="space-y-10">
            {/* 3 Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="p-8 rounded-3xl border border-neutral-200 bg-white space-y-2 hover-lift">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 block">
                  Nilai Order Masuk (C)
                </span>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900">
                  {formatRupiah(financialSummary.totalNewOrderCharges)}
                </div>
                <p className="text-xs text-neutral-500 pt-2 border-t border-neutral-100">
                  Total tagihan dari order yang terbit hari ini
                </p>
              </div>

              <div className="p-8 rounded-3xl border border-neutral-200 bg-white space-y-2 hover-lift">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-600 block">
                  Total Uang Masuk Bersih (N)
                </span>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-emerald-600">
                  {formatRupiah(financialSummary.totalNetReceipts)}
                </div>
                <p className="text-xs text-neutral-500 pt-2 border-t border-neutral-100">
                  Kas: {formatRupiah(financialSummary.cashReceipts)} · Non-Kas: {formatRupiah(financialSummary.transferQrisReceipts)}
                </p>
              </div>

              <div className="p-8 rounded-3xl border border-neutral-200 bg-white space-y-2 hover-lift">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-400 block">
                  Pengeluaran Kas Kecil
                </span>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-red-600">
                  -{formatRupiah(financialSummary.expensesPaid)}
                </div>
                <p className="text-xs text-neutral-500 pt-2 border-t border-neutral-100">
                  Dipotong langsung dari laci kas shift aktif
                </p>
              </div>
            </div>

            {/* Reconciliation Explanation Banner */}
            <div className="p-8 rounded-3xl bg-neutral-900 text-white space-y-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <ShieldCheck className="size-5" /> Integritas Pembukuan PRD §9.2 Terpenuhi
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed max-w-3xl">
                Setiap angka laporan dapat dilacak hingga ke entri kuitansi receipt individual. Tidak ada saldo yang dihitung dari perkiraan ataupun hard-delete. Nilai Piutang Cutoff selalu mengacu pada histori pembukuan terverifikasi.
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Protected Audit Trail */}
        {activeTab === "audit" && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-neutral-100 text-xs text-neutral-600 flex items-center justify-between">
              <span><strong>Invarian PRD §7.5 FR36:</strong> Seluruh aktivitas pembatalan, kredit, perubahan harga, dan akses sistem tercatat mutlak dan tidak dapat diedit siapapun.</span>
              <span className="font-mono font-bold text-neutral-900">IMMUTABLE LOG</span>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-mono uppercase tracking-wider">
                  <tr>
                    <th className="py-4 px-6 font-bold">Waktu</th>
                    <th className="py-4 px-6 font-bold">Aktor</th>
                    <th className="py-4 px-6 font-bold">Aksi Sistem</th>
                    <th className="py-4 px-6 font-bold">Entitas Terkait</th>
                    <th className="py-4 px-6 font-bold">Rincian Perubahan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-medium text-neutral-800">
                  {auditEvents.map((evt) => (
                    <tr key={evt.id} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-4 px-6 font-mono text-neutral-500">{evt.time}</td>
                      <td className="py-4 px-6 font-bold text-neutral-900">{evt.actor}</td>
                      <td className="py-4 px-6">
                        <span className="px-2 py-0.5 rounded bg-neutral-100 font-mono font-bold text-[10px] text-neutral-800">
                          {evt.action}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-bold text-neutral-800">{evt.entity}</td>
                      <td className="py-4 px-6 text-neutral-600 max-w-md">{evt.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
