"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Container, PageShell, TopBar } from "@/components/ui/layout";
import { DataRow, Notice } from "@/components/ui/stat";
import { computeCashChange, computeLedger, entersLedgerImmediately } from "@/lib/domain/ledger";
import { calculateOrderQuote } from "@/lib/domain/pricing";
import { saveOrderDraft, loadOrderDraft, clearOrderDraft } from "@/lib/domain/drafts";
import { buildIntakeWhatsAppMessage, generateWhatsAppUrl } from "@/lib/domain/whatsapp";
import { formatRupiah, formatWeight } from "@/lib/utils";
import { ServiceVersion } from "@/types";
import { 
  AlertCircle, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Printer, 
  Trash2, 
  Loader2, 
  FileText,
  Send,
  Zap,
  RotateCcw
} from "lucide-react";
import { useAuth } from "@/lib/supabase/auth-context";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { ThermalReceiptModal, ThermalReceiptProps } from "@/components/cashier/thermal-receipt";
import { ConditionPhotoUploader, ConditionPhoto } from "@/components/cashier/condition-photo-uploader";
import { SubscriptionBanner } from "@/components/common/subscription-banner";

// Default Active Services based on PRD §9.3 & §7.1
const DEFAULT_SERVICES: ServiceVersion[] = [
  {
    id: "srv_kiloan_reg",
    serviceId: "kiloan_reg",
    name: "Cuci Setrika Reguler",
    unit: "kg",
    pricePerUnitIdr: 8000,
    minGrams: 3000,
    incrementGrams: 100,
    slaHours: 48,
    workflowSteps: ["QUEUED", "WASHING", "DRYING", "IRONING", "QC", "READY"],
    isActive: true,
  },
  {
    id: "srv_kiloan_exp",
    serviceId: "kiloan_exp",
    name: "Cuci Setrika Express",
    unit: "kg",
    pricePerUnitIdr: 15000,
    minGrams: 3000,
    incrementGrams: 100,
    slaHours: 24,
    workflowSteps: ["QUEUED", "WASHING", "DRYING", "IRONING", "QC", "READY"],
    isActive: true,
  },
  {
    id: "srv_setrika_only",
    serviceId: "setrika_only",
    name: "Setrika Saja",
    unit: "kg",
    pricePerUnitIdr: 6000,
    minGrams: 2000,
    incrementGrams: 100,
    slaHours: 24,
    workflowSteps: ["QUEUED", "IRONING", "QC", "READY"],
    isActive: true,
  },
  {
    id: "srv_bedcover",
    serviceId: "bedcover_satuan",
    name: "Bedcover King (Satuan)",
    unit: "piece",
    pricePerUnitIdr: 35000,
    minGrams: 0,
    incrementGrams: 1,
    slaHours: 48,
    workflowSteps: ["QUEUED", "WASHING", "DRYING", "IRONING", "QC", "READY"],
    isActive: true,
  },
];

const METHODS = ["CASH", "TRANSFER", "QRIS"] as const;

interface OrderItemState {
  serviceId: string;
  quantityInput: string;
  notes: string;
}

export default function NewOrderPage() {
  const { activeOutlet, activeMembership } = useAuth();
  const [services, setServices] = useState<ServiceVersion[]>(DEFAULT_SERVICES);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [nameError, setNameError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [items, setItems] = useState<OrderItemState[]>([
    { serviceId: "srv_kiloan_reg", quantityInput: "2350", notes: "" },
  ]);
  const [discountInput, setDiscountInput] = useState("2000");
  const [depositInput, setDepositInput] = useState("10000");
  const [tenderedInput, setTenderedInput] = useState("10000");
  const [paymentMethod, setPaymentMethod] = useState<(typeof METHODS)[number]>("CASH");
  const [photos, setPhotos] = useState<ConditionPhoto[]>([]);

  // Emergency Receipt / Offline Recovery (PRD §14.4 & T30)
  const [isEmergencyRecovery, setIsEmergencyRecovery] = useState(false);
  const [emergencyReference, setEmergencyReference] = useState("");
  const [emergencyOccurredAt, setEmergencyOccurredAt] = useState("");
  const [emergencyCashAlreadyCollected, setEmergencyCashAlreadyCollected] = useState(false);

  // Result states
  const [isCommitted, setIsCommitted] = useState(false);
  const [createdOrderNumber, setCreatedOrderNumber] = useState("");
  const [createdOrderId, setCreatedOrderId] = useState("");
  const [trackingToken, setTrackingToken] = useState("");
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Load draft if available (PRD §7.2 FR08)
  useEffect(() => {
    if (!activeOutlet?.id) return;
    const draft = loadOrderDraft(activeOutlet.id);
    if (draft) {
      setCustomerName(draft.customerName || "");
      setCustomerPhone(draft.customerPhone || "");
      if (draft.items && draft.items.length > 0) setItems(draft.items);
      if (draft.discountInput) setDiscountInput(draft.discountInput);
      if (draft.depositInput) setDepositInput(draft.depositInput);
    }
  }, [activeOutlet?.id]);

  // Auto-save draft on changes
  useEffect(() => {
    if (!activeOutlet?.id || isCommitted) return;
    if (customerName || items.length > 1 || items[0].quantityInput !== "2350") {
      saveOrderDraft(activeOutlet.id, {
        customerName,
        customerPhone,
        items,
        discountInput,
        depositInput,
        paymentMethod,
      });
    }
  }, [activeOutlet?.id, customerName, customerPhone, items, discountInput, depositInput, paymentMethod, isCommitted]);

  // Load live services from Supabase
  useEffect(() => {
    async function loadServices() {
      if (!activeOutlet?.id) return;
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("service_versions")
          .select("id, service_id, name, unit, price_per_unit_idr, min_grams, increment_grams, sla_hours, workflow_steps, is_active")
          .eq("outlet_id", activeOutlet.id)
          .eq("is_active", true);

        if (!error && data && data.length > 0) {
          const mapped: ServiceVersion[] = data.map((d: any) => ({
            id: d.id,
            serviceId: d.service_id,
            name: d.name,
            unit: d.unit,
            pricePerUnitIdr: Number(d.price_per_unit_idr),
            minGrams: d.min_grams || 0,
            incrementGrams: d.increment_grams || 1,
            slaHours: d.sla_hours || 24,
            workflowSteps: d.workflow_steps || ["QUEUED", "READY"],
            isActive: d.is_active,
          }));
          setServices(mapped);
        }
      } catch {
        // use fallback
      }
    }
    loadServices();
  }, [activeOutlet?.id]);

  const serviceOptions = services.map((s) => ({
    value: s.id,
    label: s.name,
    hint: `${formatRupiah(s.pricePerUnitIdr)} / ${s.unit} · SLA ${s.slaHours} jam`,
  }));

  const domainLines = items.map((item) => {
    const srv = services.find((s) => s.id === item.serviceId) || services[0] || DEFAULT_SERVICES[0];
    return {
      serviceVersion: srv,
      actualQuantity: parseFloat(item.quantityInput) || 0,
      notes: item.notes,
    };
  });

  const quote = calculateOrderQuote(domainLines, parseInt(discountInput, 10) || 0);
  const depositIdr = parseInt(depositInput, 10) || 0;
  const tenderedIdr = parseInt(tenderedInput, 10) || 0;

  const depositEntersLedger = entersLedgerImmediately(paymentMethod) && !emergencyCashAlreadyCollected;
  const ledger = computeLedger({
    initialChargesIdr: quote.totalChargesIdr,
    confirmedReceiptsIdr: depositEntersLedger ? depositIdr : 0,
  });
  const balanceIdr = ledger.balanceIdr;
  const changeIdr = computeCashChange(depositIdr, tenderedIdr);

  const handleAddItem = () =>
    setItems((prev) => [...prev, { serviceId: services[0]?.id || "srv_kiloan_reg", quantityInput: "1000", notes: "" }]);

  const handleRemoveItem = (index: number) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const handleCommitOrder = async () => {
    if (!customerName.trim()) {
      setNameError("Nama pelanggan wajib diisi.");
      return;
    }

    if (isEmergencyRecovery && !emergencyReference.trim()) {
      setSubmitError("Nomor seri nota darurat fisik wajib diisi untuk mode recovery.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const outletId = activeOutlet?.id;

      // 1. Find or create customer
      let customerId = crypto.randomUUID();
      try {
        const custRes = await apiFetch<{ id: string }>("/api/customers", {
          method: "POST",
          body: JSON.stringify({
            outlet_id: outletId,
            tenant_id: activeMembership?.tenant_id,
            name: customerName.trim(),
            phone: customerPhone.trim() || null,
          }),
        });
        if (custRes?.id) customerId = custRes.id;
      } catch {
        // continue
      }

      // 2. Prepare lines payload
      const linesPayload = items.map((it) => ({
        service_version_id: it.serviceId,
        actual_quantity: parseInt(it.quantityInput, 10) || 1,
        notes: it.notes || null,
      }));

      // 3. Prepare cash receipt payload if CASH
      const cashPayload = depositEntersLedger && depositIdr > 0
        ? {
            applied_idr: depositIdr,
            tendered_idr: tenderedIdr,
            session_id: null,
          }
        : null;

      // 4. Call confirm_order endpoint
      const orderRes = await apiFetch<{
        order_number: string;
        order_id: string;
        tracking_token?: string;
      }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          outlet_id: outletId,
          customer_id: customerId,
          lines: linesPayload,
          discount_idr: parseInt(discountInput, 10) || 0,
          cash: cashPayload,
          emergency_reference: isEmergencyRecovery ? emergencyReference.trim() : null,
          occurred_at: isEmergencyRecovery && emergencyOccurredAt ? emergencyOccurredAt : null,
        }),
      });

      const orderNo = orderRes.order_number || `OUT-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;
      setCreatedOrderNumber(orderNo);
      setCreatedOrderId(orderRes.order_id || "");
      setTrackingToken(orderRes.tracking_token || orderNo);

      // 5. If non-cash deposit, create pending payment attempt
      if (!depositEntersLedger && depositIdr > 0 && orderRes.order_id && !emergencyCashAlreadyCollected) {
        try {
          await apiFetch(`/api/orders/${orderRes.order_id}/payment-attempts`, {
            method: "POST",
            body: JSON.stringify({
              method: paymentMethod,
              amount_idr: depositIdr,
              reference: `DP ${paymentMethod} saat intake`,
            }),
          });
        } catch {
          // recorded
        }
      }

      if (activeOutlet?.id) clearOrderDraft(activeOutlet.id);
      setIsCommitted(true);
    } catch (err: any) {
      setSubmitError(err.message || "Gagal mencatat order ke server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentReceiptData: ThermalReceiptProps = {
    orderNumber: createdOrderNumber,
    acceptedAt: new Date().toISOString(),
    promisedAt: quote.suggestedDueAt,
    customerName,
    customerPhone,
    outletName: activeOutlet?.name || "LaundryFlow Outlet Surabaya",
    outletAddress: "Jl. Manyar Kertoarjo No. 45",
    outletPhone: "0812-9988-7766",
    lines: quote.lines.map((l) => ({
      serviceName: l.serviceName,
      unit: l.unit,
      actualQuantity: l.actualQuantity,
      billableQuantity: l.billableQuantity,
      ratePerUnitIdr: l.ratePerUnitIdr,
      subtotalIdr: l.subtotalIdr,
    })),
    subtotalIdr: quote.subtotalIdr,
    discountIdr: quote.discountIdr,
    totalChargesIdr: quote.totalChargesIdr,
    paidAmountIdr: depositEntersLedger ? depositIdr : 0,
    balanceIdr,
    paymentMethod,
    tenderedIdr: depositEntersLedger ? tenderedIdr : undefined,
    changeIdr: depositEntersLedger ? changeIdr : undefined,
    bagCodes: [`BAG-${createdOrderNumber.slice(-4)}-01`],
  };

  const handleSendWhatsApp = () => {
    if (!customerPhone) return;
    const msg = buildIntakeWhatsAppMessage({
      orderNumber: createdOrderNumber,
      customerName,
      customerPhone,
      outletName: activeOutlet?.name || "LaundryFlow Outlet Surabaya",
      serviceSummary: quote.lines.map((l) => `${l.serviceName} (${l.unit === "kg" ? formatWeight(l.actualQuantity) : l.actualQuantity + " pcs"})`).join(", "),
      balanceIdr,
      trackingToken,
    });
    const url = generateWhatsAppUrl(customerPhone, msg);
    window.open(url, "_blank");

    if (createdOrderId) {
      fetch(`/api/orders/${createdOrderId}/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient_phone: customerPhone,
          message_preview: msg.slice(0, 100),
        }),
      }).catch(() => {});
    }
  };

  /* ---------------------------------------------------------------- committed view */
  if (isCommitted) {
    return (
      <PageShell className="flex items-center justify-center p-6 sm:p-12">
        <SubscriptionBanner status="TRIAL" daysRemaining={14} />

        <Card pad="lg" className="rise-in w-full max-w-xl shadow-monolith mt-4">
          <div className="space-y-3 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-ok-soft text-ok">
              <CheckCircle2 className="size-8" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Order Berhasil Dicatat</h1>
            <div className="num inline-block rounded-full bg-sunken px-4 py-1.5 font-mono text-xs font-bold">
              {createdOrderNumber}
            </div>
          </div>

          <div className="mt-8 space-y-4 rounded-card bg-sunken p-6 sm:p-8">
            <DataRow
              label="Pelanggan"
              value={`${customerName} (${customerPhone || "Tanpa No HP"})`}
            />
            <DataRow label="Total tagihan (C)" value={formatRupiah(quote.totalChargesIdr)} />
            <DataRow
              label={depositEntersLedger ? "DP tunai masuk (N)" : `DP ${paymentMethod} · menunggu verifikasi`}
              value={formatRupiah(depositIdr)}
              tone={depositEntersLedger ? "positive" : "warning"}
            />
            {depositEntersLedger && changeIdr > 0 && (
              <DataRow label="Kembalian diserahkan" value={formatRupiah(changeIdr)} />
            )}
            <div className="border-t border-line pt-4">
              <DataRow
                label="Sisa tagihan"
                value={balanceIdr === 0 ? "LUNAS" : formatRupiah(balanceIdr)}
                strong
                tone={balanceIdr > 0 ? "warning" : "positive"}
              />
            </div>
            <DataRow
              label="Target selesai (SLA)"
              value={new Date(quote.suggestedDueAt).toLocaleString("id-ID", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            />
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" size="block" onClick={() => setShowPrintModal(true)}>
              <Printer className="size-4" /> Cetak Struk Thermal
            </Button>
            {customerPhone && (
              <Button size="block" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSendWhatsApp}>
                <Send className="size-4 mr-1" /> Kirim WhatsApp Struk
              </Button>
            )}
          </div>

          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsCommitted(false);
                setCustomerName("");
                setCustomerPhone("");
                setPhotos([]);
                setItems([{ serviceId: services[0]?.id || "srv_kiloan_reg", quantityInput: "2350", notes: "" }]);
              }}
            >
              + Order Baru Berikutnya
            </Button>
          </div>
        </Card>

        {showPrintModal && (
          <ThermalReceiptModal
            receipt={currentReceiptData}
            onClose={() => setShowPrintModal(false)}
          />
        )}
      </PageShell>
    );
  }

  /* ---------------------------------------------------------------- intake view */
  return (
    <PageShell>
      <SubscriptionBanner status="TRIAL" daysRemaining={14} />

      <TopBar
        title="POS Kasir — Intake Order"
        subtitle="Formula billing snapshot PRD §9.1"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEmergencyRecovery(!isEmergencyRecovery)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                isEmergencyRecovery 
                  ? "bg-amber-500 text-black shadow-sm" 
                  : "border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              <Zap className="size-3.5" />
              {isEmergencyRecovery ? "Mode Recovery Aktif" : "Input Nota Darurat"}
            </button>
            <span className="num hidden rounded-full bg-sunken px-4 py-2 font-mono text-[11px] font-bold sm:inline-block">
              {activeOutlet?.name || "OUTLET SURABAYA"} ({activeOutlet?.timezone?.includes("Jakarta") ? "WIB" : "WITA"})
            </span>
          </div>
        }
      />

      <Container className="grid grid-cols-1 items-start gap-10 py-10 pb-24 lg:grid-cols-12 lg:gap-16 sm:py-14">
        {/* LEFT — form */}
        <div className="space-y-10 lg:col-span-7">
          {submitError && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
              <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Gagal Menyimpan Order</span>
                <p>{submitError}</p>
              </div>
            </div>
          )}

          {/* Emergency Recovery Card (PRD §14.4 & T30) */}
          {isEmergencyRecovery && (
            <div className="p-6 rounded-3xl bg-amber-50 border border-amber-300 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 text-amber-950 font-bold text-sm">
                <Zap className="size-4 text-amber-600" />
                Mode Pemulihan Nota Kertas Offline (PRD §14.4)
              </div>
              <p className="text-xs text-amber-900">
                Gunakan saat memasukkan transaksi yang sebelumnya dicatat di nota kertas manual saat mati lampu/koneksi putus.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nomor Seri Nota Kertas *" required>
                  <Input
                    value={emergencyReference}
                    onChange={(e) => setEmergencyReference(e.target.value)}
                    placeholder="Contoh: NOTA-MANUAL-0045"
                    className="font-mono bg-white"
                  />
                </Field>
                <Field label="Waktu Transaksi Offline Asal">
                  <Input
                    type="datetime-local"
                    value={emergencyOccurredAt}
                    onChange={(e) => setEmergencyOccurredAt(e.target.value)}
                    className="bg-white"
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-amber-950 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emergencyCashAlreadyCollected}
                  onChange={(e) => setEmergencyCashAlreadyCollected(e.target.checked)}
                  className="size-4 rounded"
                />
                Uang kas DP sudah dihitung fisik saat shift mati lampu (Jangan tambah ke kas laci hari ini)
              </label>
            </div>
          )}

          {/* Section 1: Customer */}
          <section className="space-y-4">
            <span className="eyebrow block">01. Identitas Pelanggan</span>
            <Card pad="lg" className="grid grid-cols-1 gap-6 sm:grid-cols-2 shadow-xs">
              <Field label="Nama Pelanggan" required error={nameError}>
                <Input
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setNameError("");
                  }}
                  placeholder="Contoh: Bpk. Ahmad"
                  autoComplete="name"
                />
              </Field>
              <Field label="WhatsApp" hint="Dipakai untuk kirim link struk digital & tracking.">
                <Input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0812xxxxxxx"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </Field>
            </Card>
          </section>

          {/* Section 2: Services & Weight */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="eyebrow">02. Layanan & Berat / Jumlah</span>
              <Button type="button" size="sm" variant="outline" onClick={handleAddItem}>
                <Plus className="size-3.5" /> Tambah Item
              </Button>
            </div>

            <div className="space-y-4">
              {items.map((item, index) => {
                const srv = services.find((s) => s.id === item.serviceId) || services[0] || DEFAULT_SERVICES[0];
                const isKiloan = srv.unit === "kg";
                const lineQuote = quote.lines[index];

                return (
                  <Card key={index} pad="lg" className="space-y-5 shadow-xs">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <Field label={`Item #${index + 1} — Layanan`}>
                          <Select
                            value={item.serviceId}
                            onValueChange={(val: string) => {
                              setItems((prev) => {
                                const next = [...prev];
                                next[index] = { ...next[index], serviceId: val };
                                return next;
                              });
                            }}
                            options={serviceOptions}
                          />
                        </Field>
                      </div>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          aria-label={`Hapus item #${index + 1}`}
                          className="mt-7 grid size-11 place-items-center rounded-control text-ink-muted transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field
                        label={isKiloan ? "Berat Aktual Timbangan (Gram)" : "Jumlah (Satuan)"}
                        hint={isKiloan ? "1 kg = 1000 gram. Input angka dari timbangan digital." : "Jumlah pcs pakaian / linen."}
                      >
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={item.quantityInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems((prev) => {
                              const next = [...prev];
                              next[index] = { ...next[index], quantityInput: val };
                              return next;
                            });
                          }}
                          placeholder={isKiloan ? "Contoh: 2350" : "1"}
                          className="num font-bold text-base"
                        />
                      </Field>

                      <div className="rounded-control border border-line bg-sunken/40 p-4">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">Subtotal Item</div>
                        <div className="num mt-1 text-2xl font-black tracking-tight text-ink">
                          {formatRupiah(lineQuote?.subtotalIdr || 0)}
                        </div>
                        {isKiloan && lineQuote && (
                          <div className="num mt-1 text-[11px] text-ink-muted">
                            Tertagih: {formatWeight(lineQuote.billableQuantity)}
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Section 3: Condition Photos (PRD §7.2 FR12) */}
          <section className="space-y-4">
            <span className="eyebrow block">03. Dokumentasi Kondisi Fisik</span>
            <Card pad="lg" className="shadow-xs">
              <ConditionPhotoUploader
                photos={photos}
                onChange={setPhotos}
                maxPhotos={3}
              />
            </Card>
          </section>
        </div>

        {/* RIGHT — summary */}
        <div className="space-y-6 lg:col-span-5">
          <Card pad="lg" className="sticky top-28 space-y-8 shadow-card">
            <div>
              <span className="eyebrow block">04. Ringkasan & Pembayaran</span>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight">Kalkulasi Server</h2>
            </div>

            <div className="space-y-4">
              <DataRow label="Subtotal layanan" value={formatRupiah(quote.subtotalIdr)} />
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-semibold text-ink-muted">Diskon tetap (IDR)</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className="num h-10 w-32 text-right text-xs font-bold"
                />
              </div>
              <div className="border-t border-line pt-4">
                <DataRow label="Total tagihan (C)" value={formatRupiah(quote.totalChargesIdr)} strong />
              </div>
            </div>

            <div className="space-y-4 border-t border-line pt-6">
              <div>
                <label className="text-xs font-bold text-neutral-700 block mb-2">Metode Bayar DP</label>
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map((m) => (
                    <Button
                      key={m}
                      type="button"
                      size="sm"
                      variant={paymentMethod === m ? "solid" : "outline"}
                      onClick={() => setPaymentMethod(m)}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
              </div>

              <Field label="Nominal DP Diterima (IDR)">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={depositInput}
                  onChange={(e) => setDepositInput(e.target.value)}
                  className="num font-bold text-base"
                />
              </Field>

              {depositEntersLedger && (
                <Field label="Uang Fisik Diterima Kasir (IDR)" hint="Kelebihan dihitung otomatis sebagai uang kembalian.">
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={tenderedInput}
                    onChange={(e) => setTenderedInput(e.target.value)}
                    className="num font-bold"
                  />
                </Field>
              )}

              <div className="space-y-2 rounded-control bg-sunken p-4 text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Sisa tagihan:</span>
                  <span className={`num font-bold ${balanceIdr > 0 ? "text-warn" : "text-ok"}`}>
                    {balanceIdr === 0 ? "LUNAS" : formatRupiah(balanceIdr)}
                  </span>
                </div>
                {depositEntersLedger && changeIdr > 0 && (
                  <div className="flex justify-between border-t border-line pt-2">
                    <span className="text-ink-muted">Kembalian:</span>
                    <span className="num font-bold text-ink">{formatRupiah(changeIdr)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-control border border-line bg-paper p-4 text-xs">
              <div className="flex items-center gap-2 font-bold text-ink">
                <Clock className="size-4 text-ink-muted" /> Target Selesai (SLA):
              </div>
              <div className="num mt-1 text-ink-soft">
                {new Date(quote.suggestedDueAt).toLocaleString("id-ID", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>

            <Button
              size="block"
              onClick={handleCommitOrder}
              disabled={isSubmitting || quote.totalChargesIdr <= 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Menyimpan Order...
                </>
              ) : (
                <>
                  Konfirmasi &amp; Simpan Order <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </Card>
        </div>
      </Container>
    </PageShell>
  );
}
