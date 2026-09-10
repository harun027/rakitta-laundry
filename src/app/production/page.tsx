"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, SearchInput } from "@/components/ui/field";
import { PageBody, PageShell, SectionHead, TopBar } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { Notice } from "@/components/ui/stat";
import { STAGE_LABEL, nextStage } from "@/lib/domain/ledger";
import type { WorkStage } from "@/types";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  PackagePlus,
  Search,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/supabase/auth-context";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";

interface ProductionItem {
  id: string;
  version: number;
  orderNumber: string;
  customerName: string;
  serviceName: string;
  quantityLabel: string;
  stage: WorkStage;
  dueAt: string;
  bagCodes: string[];
  workflow: WorkStage[];
  isOverdue?: boolean;
  notes?: string;
  rackCode?: string;
}

const FLOW_WASH_IRON: WorkStage[] = ["QUEUED", "WASHING", "DRYING", "IRONING", "QC", "READY"];
const FLOW_IRON_ONLY: WorkStage[] = ["QUEUED", "IRONING", "QC", "READY"];

const INITIAL_QUEUE: ProductionItem[] = [
  {
    id: "wi-101",
    version: 1,
    orderNumber: "OUT-260910-1001",
    customerName: "Ahmad Dahlan",
    serviceName: "Cuci Setrika Reguler",
    quantityLabel: "2,4 kg (3,0 kg)",
    stage: "QUEUED",
    workflow: FLOW_WASH_IRON,
    dueAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    bagCodes: ["BAG-001A"],
    notes: "Baju putih dipisah",
  },
  {
    id: "wi-102",
    version: 1,
    orderNumber: "OUT-260910-1002",
    customerName: "Siti Rahma",
    serviceName: "Cuci Setrika Express",
    quantityLabel: "4,2 kg (4,3 kg)",
    stage: "WASHING",
    workflow: FLOW_WASH_IRON,
    dueAt: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
    bagCodes: ["BAG-002A", "BAG-002B"],
    notes: "Harap wangi lavender",
  },
  {
    id: "wi-103",
    version: 1,
    orderNumber: "OUT-260909-0988",
    customerName: "Budi Santoso",
    serviceName: "Setrika Saja",
    quantityLabel: "3,1 kg (3,2 kg)",
    stage: "IRONING",
    workflow: FLOW_IRON_ONLY,
    dueAt: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
    bagCodes: ["BAG-003A"],
    isOverdue: true,
  },
  {
    id: "wi-104",
    version: 1,
    orderNumber: "OUT-260910-1005",
    customerName: "Dewi Lestari",
    serviceName: "Bedcover King (Satuan)",
    quantityLabel: "1 Pcs",
    stage: "QC",
    workflow: FLOW_WASH_IRON,
    dueAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    bagCodes: ["BAG-004A"],
  },
  {
    id: "wi-105",
    version: 1,
    orderNumber: "OUT-260910-1000",
    customerName: "Hendro",
    serviceName: "Cuci Setrika Reguler",
    quantityLabel: "5,0 kg",
    stage: "READY",
    workflow: FLOW_WASH_IRON,
    dueAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
    bagCodes: ["BAG-005A"],
    rackCode: "RAK-B03",
  },
];

const STAGE_FILTERS = ["ALL", "QUEUED", "WASHING", "DRYING", "IRONING", "QC", "READY"] as const;

export default function ProductionPage() {
  const { activeOutlet } = useAuth();
  const [items, setItems] = useState<ProductionItem[]>(INITIAL_QUEUE);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ProductionItem | null>(null);
  const [rackInput, setRackInput] = useState("");
  const [rackError, setRackError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterStage, setFilterStage] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const loadWorkItems = useCallback(async () => {
    if (!activeOutlet?.id) return;
    try {
      setIsLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("work_items")
        .select(`
          id, version, stage, workflow_snapshot, due_at,
          orders (order_number, customers (name), final_packages (rack_code)),
          order_lines (actual_quantity, unit, notes, service_versions (name)),
          intake_bags (bag_code)
        `)
        .eq("outlet_id", activeOutlet.id)
        .order("due_at", { ascending: true });

      if (!error && data && data.length > 0) {
        const mapped: ProductionItem[] = data.map((d: any) => {
          const ord = d.orders;
          const ol = d.order_lines;
          const bags = (d.intake_bags || []).map((b: any) => b.bag_code);
          const pkg = ord?.final_packages?.[0];
          const due = new Date(d.due_at);
          const isOverdue = due.getTime() < Date.now() && d.stage !== "READY";

          const qtyLabel = ol?.unit === "kg"
            ? `${(ol.actual_quantity / 1000).toFixed(1)} kg`
            : `${ol?.actual_quantity || 1} Pcs`;

          return {
            id: d.id,
            version: d.version || 1,
            orderNumber: ord?.order_number || "OUT-000",
            customerName: ord?.customers?.name || "Pelanggan",
            serviceName: ol?.service_versions?.name || "Layanan Cuci",
            quantityLabel: qtyLabel,
            stage: d.stage as WorkStage,
            workflow: (d.workflow_snapshot || FLOW_WASH_IRON) as WorkStage[],
            dueAt: d.due_at,
            bagCodes: bags.length > 0 ? bags : ["BAG-01"],
            notes: ol?.notes,
            rackCode: pkg?.rack_code,
            isOverdue,
          };
        });
        setItems(mapped);
      }
    } catch {
      // fallback
    } finally {
      setIsLoading(false);
    }
  }, [activeOutlet?.id]);

  useEffect(() => {
    loadWorkItems();
  }, [loadWorkItems]);

  const handleAdvanceStage = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const next = nextStage(item.workflow, item.stage);
    if (!next) return;

    if (next === "READY") {
      setSelectedItem(item);
      setRackInput(item.rackCode || "RAK-A01");
      setRackError("");
      return;
    }

    try {
      await apiFetch(`/api/work-items/${item.id}/transitions`, {
        method: "POST",
        body: JSON.stringify({
          expected_version: item.version,
          to_stage: next,
        }),
      });

      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, stage: next, version: it.version + 1 } : it))
      );
    } catch (err: any) {
      alert(err.message || "Gagal memperbarui status produksi.");
      loadWorkItems();
    }
  };

  const handleConfirmQcAndPack = async () => {
    if (!selectedItem || !rackInput.trim()) {
      setRackError("Nomor rak wajib diisi sebelum status Siap Diambil.");
      return;
    }

    setIsSubmitting(true);
    setRackError("");

    try {
      // 1. Pack and record rack code
      await apiFetch(`/api/work-items/${selectedItem.id}/pack`, {
        method: "POST",
        body: JSON.stringify({
          rack_code: rackInput.trim(),
        }),
      });

      // 2. Advance to READY
      await apiFetch(`/api/work-items/${selectedItem.id}/transitions`, {
        method: "POST",
        body: JSON.stringify({
          expected_version: selectedItem.version,
          to_stage: "READY",
        }),
      });

      setItems((prev) =>
        prev.map((it) =>
          it.id === selectedItem.id
            ? { ...it, stage: "READY", rackCode: rackInput.trim(), version: it.version + 1 }
            : it
        )
      );
      setSelectedItem(null);
    } catch (err: any) {
      setRackError(err.message || "Gagal menyimpan rak dan status READY.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredItems = items.filter((it) => {
    const q = searchQuery.toLowerCase();
    const matchStage = filterStage === "ALL" || it.stage === filterStage;
    const matchSearch =
      it.orderNumber.toLowerCase().includes(q) ||
      it.customerName.toLowerCase().includes(q) ||
      it.bagCodes.some((b) => b.toLowerCase().includes(q));
    return matchStage && matchSearch;
  });

  const activeCount = items.filter((i) => i.stage !== "READY").length;

  return (
    <PageShell>
      <TopBar
        width="wide"
        title="Workboard Produksi & QC"
        subtitle="Urutan deadline tercepat · Snapshot alur kerja PRD §5.3"
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={loadWorkItems} disabled={isLoading}>
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Badge variant="accent">Antrean aktif: {activeCount}</Badge>
          </div>
        }
      />

      <PageBody width="wide">
        <SectionHead
          eyebrow="Lantai Produksi"
          title="Antrean Mesin Hari Ini"
          description="Geser setiap order satu tahap ke kanan. Status READY hanya bisa dikunci setelah QC dan nomor rak terisi."
          size="md"
        />

        {/* Controls */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput
            icon={<Search className="size-4" />}
            placeholder="Cari nomor order, nama, atau kode kantong..."
            aria-label="Cari order produksi"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full lg:max-w-xs"
          />
          <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 lg:mx-0 lg:flex-wrap lg:justify-end lg:overflow-visible lg:px-0 lg:pb-0">
            {STAGE_FILTERS.map((st) => (
              <Button
                key={st}
                size="sm"
                variant={filterStage === st ? "solid" : "outline"}
                onClick={() => setFilterStage(st)}
                className="shrink-0"
              >
                {st === "ALL" ? "Semua Tahap" : STAGE_LABEL[st as WorkStage]}
              </Button>
            ))}
          </div>
        </div>

        {/* Work cards */}
        {filteredItems.length === 0 ? (
          <Card pad="lg" className="text-center text-ink-muted">
            Tidak ada item produksi pada tahap ini.
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredItems.map((item) => {
              const next = nextStage(item.workflow, item.stage);
              const isReady = item.stage === "READY";

              return (
                <Card
                  key={item.id}
                  pad="lg"
                  className={`flex flex-col justify-between transition-all hover:border-line-strong ${
                    item.isOverdue ? "border-warn/40 bg-warn-soft/20" : ""
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="num font-mono text-sm font-black text-ink">
                          {item.orderNumber}
                        </span>
                        <div className="text-sm font-bold text-ink-soft">
                          {item.customerName}
                        </div>
                      </div>
                      <Badge variant={isReady ? "success" : item.isOverdue ? "warning" : "accent"}>
                        {STAGE_LABEL[item.stage]}
                      </Badge>
                    </div>

                    <div className="rounded-control bg-sunken/70 p-3 text-xs space-y-1">
                      <div className="font-bold text-ink">{item.serviceName}</div>
                      <div className="flex justify-between text-ink-muted">
                        <span>Jumlah/Berat: {item.quantityLabel}</span>
                        {item.rackCode && (
                          <span className="font-bold text-ok">Rak: {item.rackCode}</span>
                        )}
                      </div>
                      {item.notes && (
                        <div className="pt-1 text-[11px] italic text-ink-muted">
                          "{item.notes}"
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {item.bagCodes.map((b) => (
                        <span
                          key={b}
                          className="rounded-full bg-paper px-2.5 py-0.5 font-mono text-[10px] font-bold text-ink-muted border border-line"
                        >
                          {b}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                      <Clock className="size-3.5 shrink-0" />
                      <span>
                        Deadline:{" "}
                        {new Date(item.dueAt).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        WIB
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-line pt-4">
                    {next ? (
                      <Button
                        size="block"
                        variant={next === "READY" ? "solid" : "outline"}
                        onClick={() => handleAdvanceStage(item.id)}
                      >
                        {next === "READY" ? (
                          <>
                            <PackagePlus className="size-4" /> QC & Alokasi Rak
                          </>
                        ) : (
                          <>
                            Lanjut ke {STAGE_LABEL[next]} <ArrowRight className="size-4" />
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="flex items-center justify-center gap-2 rounded-control bg-ok-soft p-2.5 text-xs font-bold text-ok">
                        <CheckCircle2 className="size-4" /> Siap Diambil di {item.rackCode || "Rak"}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Modal QC & Rak */}
        <Modal
          open={!!selectedItem}
          onClose={() => setSelectedItem(null)}
          title="QC Selesai & Alokasi Rak"
          description={`Order ${selectedItem?.orderNumber} · ${selectedItem?.customerName}`}
        >
          {rackError && (
            <div className="p-3 mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 text-amber-600 shrink-0" />
              <span>{rackError}</span>
            </div>
          )}

          <div className="space-y-4">
            <Field label="Nomor / Kode Rak Penyimpanan" required hint="Contoh: RAK-A01, RAK-GANTUNG-02">
              <Input
                value={rackInput}
                onChange={(e) => setRackInput(e.target.value)}
                placeholder="RAK-A01"
                className="font-bold uppercase font-mono"
              />
            </Field>

            <Notice tone="info" icon={<CheckCircle2 className="size-4" />}>
              <span>
                Dengan menyimpan rak, pakaian dinyatakan lolos QC dan siap diserahkan kepada pelanggan.
              </span>
            </Notice>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setSelectedItem(null)}>
                Batal
              </Button>
              <Button onClick={handleConfirmQcAndPack} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Mengunci Rak...
                  </>
                ) : (
                  "Kunci Rak & Ubah ke READY"
                )}
              </Button>
            </div>
          </div>
        </Modal>
      </PageBody>
    </PageShell>
  );
}
