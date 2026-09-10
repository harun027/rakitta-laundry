"use client";

import { useState } from "react";
import Link from "next/link";
import { formatRupiah } from "@/lib/utils";
import { 
  buildReadyWhatsAppMessage, 
  buildUncollectedReminderWhatsAppMessage, 
  generateWhatsAppUrl 
} from "@/lib/domain/whatsapp";
import { 
  ArrowLeft, 
  Phone, 
  Clock, 
  AlertTriangle, 
  RotateCcw, 
  Wallet, 
  CheckCircle2, 
  ExternalLink,
  Search,
  Layers,
  Send
} from "lucide-react";
import { FeedbackModal, type FeedbackModalState } from "@/components/ui/feedback-modal";

export default function FollowUpAndIssuesPage() {
  const [activeTab, setActiveTab] = useState<"uncollected" | "issues" | "rework">("uncollected");
  const [searchQuery, setSearchQuery] = useState("");
  const [feedback, setFeedback] = useState<FeedbackModalState>({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
  });

  // FR35: Ready but uncollected queue
  const [uncollectedList, setUncollectedList] = useState([
    {
      id: "ord-1",
      orderNumber: "OUT-260906-0811",
      customerName: "Hendro Wibowo",
      customerPhone: "081234567890",
      serviceSummary: "Cuci Setrika Reguler (5,0 kg)",
      readySinceDays: 4,
      balanceIdr: 40000,
      rackCode: "RAK-B03",
    },
    {
      id: "ord-2",
      orderNumber: "OUT-260907-0912",
      customerName: "Rina Setyawati",
      customerPhone: "085612345678",
      serviceSummary: "Bedcover King (2 pcs)",
      readySinceDays: 3,
      balanceIdr: 0,
      rackCode: "RAK-A01",
    },
    {
      id: "ord-3",
      orderNumber: "OUT-260905-0720",
      customerName: "Dimas Anggara",
      customerPhone: "087799887766",
      serviceSummary: "Setrika Saja (3,5 kg)",
      readySinceDays: 5,
      balanceIdr: 21000,
      rackCode: "RAK-C02",
    },
  ]);

  // FR19: Issues & Blocker log
  const [issuesList, setIssuesList] = useState([
    {
      id: "iss-1",
      orderNumber: "OUT-260909-0988",
      customerName: "Budi Santoso",
      category: "STAIN",
      severity: "HIGH",
      isBlocking: true,
      description: "Noda minyak membandel di kemeja putih, butuh treatment khusus.",
      status: "OPEN",
      reportedBy: "Joko (Operator)",
      reportedAt: "Kemarin, 14:00 WIB",
    },
    {
      id: "iss-2",
      orderNumber: "OUT-260910-1004",
      customerName: "Maya Sari",
      category: "EQUIPMENT_FAILURE",
      severity: "MEDIUM",
      isBlocking: false,
      description: "Dryer #2 error pemanas, dialihkan ke Dryer #3.",
      status: "RESOLVED",
      reportedBy: "Rian (SPV)",
      reportedAt: "Hari ini, 10:30 WIB",
    },
  ]);

  // FR20: Rework cases
  const [reworkList, setReworkList] = useState([
    {
      id: "rw-1",
      caseNumber: "RW-OUT-260909-0988-101",
      orderNumber: "OUT-260909-0988",
      customerName: "Budi Santoso",
      type: "PRE_HANDOVER",
      targetStage: "WASHING",
      reason: "Pencucian ulang noda kerah baju",
      custodyState: "IN_PROGRESS",
      approvedBy: "Rian (SPV)",
    },
  ]);

  const handleSendWhatsApp = (item: typeof uncollectedList[0]) => {
    const text = buildUncollectedReminderWhatsAppMessage(
      {
        orderNumber: item.orderNumber,
        customerName: item.customerName,
        customerPhone: item.customerPhone,
        outletName: "Rakkita Surabaya Pusat",
        serviceSummary: item.serviceSummary,
        balanceIdr: item.balanceIdr,
      },
      item.readySinceDays
    );

    const url = generateWhatsAppUrl(item.customerPhone, text);
    window.open(url, "_blank");

    // Log to server (FR34/FR35)
    fetch(`/api/orders/${item.id}/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient_phone: item.customerPhone,
        message_preview: text.slice(0, 100),
      }),
    }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#111111] pb-28 antialiased selection:bg-black selection:text-white">
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
              <h1 className="text-lg font-bold tracking-tight text-neutral-900">Antrean Tindak Lanjut, Isu & Rework</h1>
              <p className="text-xs text-neutral-500">Pengingat Pelanggan via WhatsApp & Penanganan Cuci Ulang</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 sm:px-12 py-10 space-y-10">
        {/* Navigation Tabs */}
        <div className="flex gap-3 overflow-x-auto pb-2 border-b border-neutral-200">
          <button
            onClick={() => setActiveTab("uncollected")}
            className={`px-5 py-3 rounded-full text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "uncollected" 
                ? "bg-black text-white shadow-md" 
                : "border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <Clock className="size-4" />
            Siap Ambil Menumpuk (Ready &gt;3 Hari)
          </button>
          <button
            onClick={() => setActiveTab("issues")}
            className={`px-5 py-3 rounded-full text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "issues" 
                ? "bg-black text-white shadow-md" 
                : "border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <AlertTriangle className="size-4" />
            Log Isu &amp; Pemblokir (Issues)
          </button>
          <button
            onClick={() => setActiveTab("rework")}
            className={`px-5 py-3 rounded-full text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "rework" 
                ? "bg-black text-white shadow-md" 
                : "border border-neutral-200 text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <RotateCcw className="size-4" />
            Kasus Rework / Cuci Ulang
          </button>
        </div>

        {/* Tab 1: Uncollected Follow-up Queue */}
        {activeTab === "uncollected" && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-neutral-100 text-xs text-neutral-600 flex items-center justify-between">
              <span><strong>WhatsApp Manual:</strong> Pesan WhatsApp disiapkan via link `wa.me` untuk dikonfirmasi dan dikirim langsung oleh staf.</span>
              <span className="font-mono font-bold">MANUAL DISPATCH</span>
            </div>

            <div className="grid gap-4">
              {uncollectedList.map((item) => (
                <div key={item.id} className="p-6 rounded-3xl border border-neutral-200 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover-lift shadow-xs">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-neutral-900">{item.orderNumber}</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold font-mono">
                        {item.readySinceDays} Hari di Rak ({item.rackCode})
                      </span>
                    </div>
                    <div className="font-bold text-neutral-900 text-sm">{item.customerName} ({item.customerPhone})</div>
                    <div className="text-xs text-neutral-500">
                      Layanan: {item.serviceSummary} · Sisa Tagihan: <strong className={item.balanceIdr > 0 ? "text-amber-600" : "text-emerald-600"}>{item.balanceIdr === 0 ? "LUNAS" : formatRupiah(item.balanceIdr)}</strong>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSendWhatsApp(item)}
                    className="px-5 py-2.5 rounded-full bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 active:scale-95 transition-all flex items-center gap-2 shrink-0 shadow-sm"
                  >
                    <Send className="size-3.5" /> Buka WhatsApp Pengingat
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Issues / Blocker Log (FR19) */}
        {activeTab === "issues" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-mono uppercase tracking-wider">
                  <tr>
                    <th className="py-4 px-6 font-bold">No. Order</th>
                    <th className="py-4 px-6 font-bold">Kategori</th>
                    <th className="py-4 px-6 font-bold">Tingkat Keparahan</th>
                    <th className="py-4 px-6 font-bold">Sifat Blokir</th>
                    <th className="py-4 px-6 font-bold">Deskripsi Masalah</th>
                    <th className="py-4 px-6 font-bold">Status</th>
                    <th className="py-4 px-6 font-bold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-medium text-neutral-800">
                  {issuesList.map((iss) => (
                    <tr key={iss.id} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-4 px-6 font-mono font-bold text-neutral-900">{iss.orderNumber}</td>
                      <td className="py-4 px-6 font-mono font-bold">{iss.category}</td>
                      <td className="py-4 px-6">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          iss.severity === "HIGH" ? "bg-red-100 text-red-700" : "bg-neutral-100 text-neutral-700"
                        }`}>
                          {iss.severity}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`font-bold ${iss.isBlocking ? "text-red-600" : "text-neutral-500"}`}>
                          {iss.isBlocking ? "Blokir READY & Handover" : "Non-blocking"}
                        </span>
                      </td>
                      <td className="py-4 px-6 max-w-xs">{iss.description}</td>
                      <td className="py-4 px-6 font-bold text-emerald-600">{iss.status}</td>
                      <td className="py-4 px-6 text-right">
                        {iss.status === "OPEN" ? (
                          <button 
                            onClick={() => {
                              setIssuesList((prev) =>
                                prev.map((i) => (i.id === iss.id ? { ...i, status: "RESOLVED" } : i))
                              );
                              setFeedback({
                                isOpen: true,
                                type: "success",
                                title: "Isu Diselesaikan",
                                message: `Isu pada order ${iss.orderNumber} telah ditandai terselesaikan. Blokir serah terima telah dibuka.`,
                              });
                            }}
                            className="text-xs font-bold text-black hover:underline"
                          >
                            Tandai Selesai
                          </button>
                        ) : (
                          <span className="text-neutral-400">Terselesaikan</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Rework Cases (FR20) */}
        {activeTab === "rework" && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-neutral-200 bg-white overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-mono uppercase tracking-wider">
                  <tr>
                    <th className="py-4 px-6 font-bold">Nomor Kasus Rework</th>
                    <th className="py-4 px-6 font-bold">No. Order Asal</th>
                    <th className="py-4 px-6 font-bold">Tipe Rework</th>
                    <th className="py-4 px-6 font-bold">Tahap Target</th>
                    <th className="py-4 px-6 font-bold">Alasan Cuci Ulang</th>
                    <th className="py-4 px-6 font-bold">Disetujui Oleh</th>
                    <th className="py-4 px-6 font-bold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-medium text-neutral-800">
                  {reworkList.map((rw) => (
                    <tr key={rw.id} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-4 px-6 font-mono font-bold text-neutral-900">{rw.caseNumber}</td>
                      <td className="py-4 px-6 font-mono">{rw.orderNumber}</td>
                      <td className="py-4 px-6 font-bold">{rw.type}</td>
                      <td className="py-4 px-6 font-mono font-bold text-amber-700">{rw.targetStage}</td>
                      <td className="py-4 px-6 max-w-xs">{rw.reason}</td>
                      <td className="py-4 px-6">{rw.approvedBy}</td>
                      <td className="py-4 px-6 text-right font-bold text-neutral-900">{rw.custodyState}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* Global Feedback Modal */}
        <FeedbackModal
          state={feedback}
          onClose={() => setFeedback((prev) => ({ ...prev, isOpen: false }))}
        />
      </main>
    </div>
  );
}
