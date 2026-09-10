import { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { DataRow, Notice } from "@/components/ui/stat";
import { BRAND } from "@/lib/brand";
import { formatRupiah } from "@/lib/utils";
import { CheckCircle2, Info, MapPin, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: `Pelacakan Status Laundry — ${BRAND.name}`,
  description: "Status pengerjaan laundry pelanggan secara real-time.",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

const STAGES = [
  { key: "QUEUED", label: "Antrean" },
  { key: "WASHING", label: "Pencucian" },
  { key: "DRYING", label: "Pengeringan" },
  { key: "IRONING", label: "Penyetrikaan" },
  { key: "READY", label: "Siap Diambil" },
];

export default async function CustomerTrackingPage({ params }: PageProps) {
  const { token } = await params;

  let trackedData = {
    orderNumber: "OUT-260910-1000",
    outletName: `${BRAND.name} Outlet Surabaya`,
    outletPhone: "0812-9988-7766",
    outletAddress: "Jl. Manyar Kertoarjo No. 45, Surabaya",
    stage: "READY" as string,
    balanceIdr: 40000,
    totalChargesIdr: 40000,
    serviceSummary: "Cuci Setrika Reguler (5,0 kg)",
    acceptedAt: "10 Sep 2026, 08:30 WIB",
    promisedAt: "12 Sep 2026, 17:00 WIB",
    lastUpdated: "Hari ini, 14:20 WIB",
  };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_tracking", {
      p_token: token,
    });

    if (!error && data) {
      const wi = data.work_items?.[0];
      const lines = data.lines || [];
      const serviceSummary = lines.map((l: { service_name: string; actual_quantity: number; unit: string }) => 
        `${l.service_name} (${l.unit === 'kg' ? (l.actual_quantity/1000).toFixed(1) + ' kg' : l.actual_quantity + ' pcs'})`
      ).join(", ");

      trackedData = {
        orderNumber: data.order_number,
        outletName: data.outlet_name,
        outletPhone: data.outlet_phone || "0812-9988-7766",
        outletAddress: data.outlet_address || "Alamat outlet",
        stage: wi?.stage || "QUEUED",
        balanceIdr: data.balance_idr || 0,
        totalChargesIdr: data.total_charges_idr || 0,
        serviceSummary: serviceSummary || "Layanan Laundry",
        acceptedAt: new Date(data.accepted_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }),
        promisedAt: new Date(data.promised_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }),
        lastUpdated: "Realtime",
      };
    }
  } catch {
    // Fallback to sample preview if Supabase is unconfigured
  }

  const currentStageIndex = STAGES.findIndex((s) => s.key === trackedData.stage);
  const isReady = trackedData.stage === "READY" || trackedData.stage === "HANDED_OVER";

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-paper px-6 py-12">
      <main className="w-full max-w-lg space-y-8">
        <header className="space-y-2 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-ink text-sm font-black tracking-tighter text-white">
            {BRAND.mark}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">{trackedData.outletName}</h1>
          <p className="eyebrow">Pelacakan Status Cucian</p>
        </header>

        <Card pad="none" className="overflow-hidden">
          <div className="bg-ink px-6 py-7 text-white sm:px-8">
            <div className="flex items-center justify-between text-[11px] text-white/50">
              <span>Nomor Struk</span>
              <span>Update: {trackedData.lastUpdated}</span>
            </div>
            <div className="num mt-1.5 font-mono text-2xl font-bold tracking-wider">
              {trackedData.orderNumber}
            </div>
          </div>

          <div className="space-y-8 p-6 sm:p-8">
            {/* Progress */}
            <section>
              <h2 className="eyebrow mb-5">Tahapan Pengerjaan</h2>
              <ol className="relative flex items-start justify-between">
                <div className="absolute left-0 right-0 top-3.5 h-0.5 bg-line" />
                <div
                  className="absolute left-0 top-3.5 h-0.5 bg-ink transition-all"
                  style={{
                    width: `${Math.max(0, (Math.max(0, currentStageIndex) / (STAGES.length - 1)) * 100)}%`,
                  }}
                />
                {STAGES.map((st, idx) => {
                  const isDone = idx <= currentStageIndex;
                  const isCurrent = idx === currentStageIndex;
                  return (
                    <li key={st.key} className="relative z-10 flex w-14 flex-col items-center text-center">
                      <span
                        className={`grid size-7 place-items-center rounded-full text-[11px] font-bold ${
                          isCurrent
                            ? "bg-accent text-ink ring-4 ring-accent/25"
                            : isDone
                              ? "bg-ink text-white"
                              : "border-2 border-line-strong bg-surface text-ink-faint"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span
                        className={`mt-2 text-[10px] leading-tight ${
                          isCurrent ? "font-bold text-ink" : "text-ink-muted"
                        }`}
                      >
                        {st.label}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>

            {isReady && (
              <Notice tone="success" icon={<CheckCircle2 className="size-5" />}>
                <span className="block text-sm font-bold">Cucian sudah siap diambil</span>
                <span className="block">
                  Pakaian Anda telah selesai di-packing rapi dan siap diserahkan di outlet.
                </span>
              </Notice>
            )}

            <Notice tone="info" icon={<Info className="size-4" />}>
              <span>
                Tautan ini hanya menampilkan status. Pengambilan tetap diverifikasi di outlet lewat struk atau
                konfirmasi pelanggan.
              </span>
            </Notice>

            {/* Details */}
            <section className="space-y-4 border-t border-line pt-6">
              <DataRow label="Layanan" value={trackedData.serviceSummary} />
              <DataRow label="Target selesai (SLA)" value={trackedData.promisedAt} />
              <DataRow label="Total biaya" value={formatRupiah(trackedData.totalChargesIdr)} />
              <div className="border-t border-line pt-4">
                <DataRow
                  label="Sisa tagihan"
                  value={trackedData.balanceIdr > 0 ? formatRupiah(trackedData.balanceIdr) : "LUNAS"}
                  strong
                  tone={trackedData.balanceIdr > 0 ? "warning" : "positive"}
                />
              </div>
            </section>
          </div>

          <div className="space-y-3 border-t border-line bg-sunken p-6 text-xs sm:p-8">
            <div className="flex items-center gap-3 text-ink-muted">
              <MapPin className="size-4 shrink-0" />
              <span>{trackedData.outletAddress}</span>
            </div>
            <a
              href={`https://wa.me/${trackedData.outletPhone.replace(/\D/g, "")}`}
              className="flex items-center gap-3 font-bold text-ink underline-offset-4 hover:underline"
            >
              <Phone className="size-4 shrink-0" />
              <span>WhatsApp outlet: {trackedData.outletPhone}</span>
            </a>
          </div>
        </Card>
      </main>

      <footer className="pt-12 text-center text-[11px] text-ink-faint">
        Didukung oleh {BRAND.name} · Halaman ini tidak menampilkan data pribadi Anda
      </footer>
    </div>
  );
}
