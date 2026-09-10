"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox, Field, Input, SearchInput } from "@/components/ui/field";
import { PageBody, PageShell, SectionHead, TopBar } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { DataRow, Notice } from "@/components/ui/stat";
import {
  SETTLEMENT_LABEL,
  STAGE_LABEL,
  computeCashChange,
  computeLedger,
  entersLedgerImmediately,
} from "@/lib/domain/ledger";
import { formatRupiah } from "@/lib/utils";
import type { CustodyState, PaymentMethod, WorkStage } from "@/types";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  PackageCheck,
  Search,
  ShieldCheck,
  Wallet,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/supabase/auth-context";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api/client";
import { useIdempotencyKey } from "@/lib/api/idempotency";
import { FeedbackModal, type FeedbackModalState } from "@/components/ui/feedback-modal";

/** PRD FR22 — credit release needs an amount limit and a recorded reason. */
const CREDIT_LIMIT_IDR = 100000;

interface PendingAttempt {
  id?: string;
  amountIdr: number;
  method: PaymentMethod;
  reference: string;
}

interface OrderListItem {
  id: string;
  version: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  serviceSummary: string;
  stage: WorkStage;
  custodyState: CustodyState;
  /** §9.2 ledger inputs — settlement is derived from these, never stored. */
  initialChargesIdr: number;
  creditAdjustmentsIdr: number;
  confirmedReceiptsIdr: number;
  pending?: PendingAttempt;
  rackCode?: string;
  acceptedAt: string;
  promisedAt: string;
}

const INITIAL_ORDERS: OrderListItem[] = [
  {
    id: "ord-1",
    version: 1,
    orderNumber: "OUT-260910-1000",
    customerName: "Hendro Wibowo",
    customerPhone: "0812-3344-5566",
    serviceSummary: "Cuci Setrika Reguler (5,0 kg)",
    stage: "READY",
    custodyState: "IN_CUSTODY",
    initialChargesIdr: 40000,
    creditAdjustmentsIdr: 0,
    confirmedReceiptsIdr: 0,
    rackCode: "RAK-B03",
    acceptedAt: "2026-09-10T08:30:00Z",
    promisedAt: "2026-09-12T17:00:00Z",
  },
  {
    id: "ord-2",
    version: 1,
    orderNumber: "OUT-260910-1002",
    customerName: "Siti Rahma",
    customerPhone: "0857-9900-1122",
    serviceSummary: "Cuci Setrika Express (4,3 kg)",
    stage: "WASHING",
    custodyState: "IN_CUSTODY",
    initialChargesIdr: 64500,
    creditAdjustmentsIdr: 0,
    confirmedReceiptsIdr: 30000,
    acceptedAt: "2026-09-10T09:15:00Z",
    promisedAt: "2026-09-11T09:15:00Z",
  },
  {
    id: "ord-3",
    version: 1,
    orderNumber: "OUT-260909-0988",
    customerName: "Budi Santoso",
    customerPhone: "0811-2233-4455",
    serviceSummary: "Setrika Saja (3,2 kg)",
    stage: "READY",
    custodyState: "HANDED_OVER",
    initialChargesIdr: 19200,
    creditAdjustmentsIdr: 0,
    confirmedReceiptsIdr: 19200,
    rackCode: "RAK-A01",
    acceptedAt: "2026-09-08T11:00:00Z",
    promisedAt: "2026-09-09T11:00:00Z",
  },
  {
    id: "ord-4",
    version: 1,
    orderNumber: "OUT-260910-1006",
    customerName: "Rina Kartika",
    customerPhone: "0813-7788-2299",
    serviceSummary: "Bedcover King (1 pcs)",
    stage: "QC",
    custodyState: "IN_CUSTODY",
    initialChargesIdr: 35000,
    creditAdjustmentsIdr: 0,
    confirmedReceiptsIdr: 0,
    pending: { amountIdr: 35000, method: "TRANSFER", reference: "BCA/09:41/RINA K" },
    acceptedAt: "2026-09-10T09:41:00Z",
    promisedAt: "2026-09-12T09:41:00Z",
  },
];

const METHODS: PaymentMethod[] = ["CASH", "TRANSFER", "QRIS"];

function ledgerOf(o: OrderListItem) {
  return computeLedger({
    initialChargesIdr: o.initialChargesIdr,
    creditAdjustmentsIdr: o.creditAdjustmentsIdr,
    confirmedReceiptsIdr: o.confirmedReceiptsIdr,
  });
}

export default function OrdersPage() {
  const { activeOutlet, role } = useAuth();
  // §13.3 — a key per money action per order; a retry after a lost response
  // reuses it so the server replays instead of posting twice.
  const idem = useIdempotencyKey();
  const [orders, setOrders] = useState<OrderListItem[]>(INITIAL_ORDERS);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [appliedInput, setAppliedInput] = useState("");
  const [tenderedInput, setTenderedInput] = useState("");
  const [referenceInput, setReferenceInput] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);

  const [isHandoverOpen, setIsHandoverOpen] = useState(false);
  const [receiverName, setReceiverName] = useState("");
  const [isRepresentative, setIsRepresentative] = useState(false);
  const [receiverError, setReceiverError] = useState("");
  const [allowCreditApproval, setAllowCreditApproval] = useState(false);
  const [creditReason, setCreditReason] = useState("");
  const [creditError, setCreditError] = useState("");
  const [isHandoverSubmitting, setIsHandoverSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackModalState>({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
  });

  const loadOrders = useCallback(async () => {
    if (!activeOutlet?.id) return;
    try {
      setIsLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("orders")
        .select(`
          id, version, order_number, total_charges_idr, paid_amount_idr, balance_idr,
          custody_state, accepted_at, current_promised_at,
          customers (name, normalized_phone),
          order_lines (actual_quantity, unit, service_versions (name)),
          work_items (stage, version),
          final_packages (rack_code),
          payment_attempts (id, amount_idr, method, status, reference)
        `)
        .eq("outlet_id", activeOutlet.id)
        .order("accepted_at", { ascending: false });

      if (!error && data && data.length > 0) {
        const mapped: OrderListItem[] = data.map((row: any) => {
          const lines = row.order_lines || [];
          const serviceSummary = lines.map((l: any) =>
            `${l.service_versions?.name || "Layanan"} (${l.unit === 'kg' ? (l.actual_quantity / 1000).toFixed(1) + ' kg' : l.actual_quantity + ' pcs'})`
          ).join(", ");

          const wi = row.work_items?.[0];
          const pkg = row.final_packages?.[0];
          const pendingAttempt = row.payment_attempts?.find((a: any) => a.status === 'PENDING_VERIFICATION');

          return {
            id: row.id,
            version: row.version || 1,
            orderNumber: row.order_number,
            customerName: row.customers?.name || "Pelanggan",
            customerPhone: row.customers?.normalized_phone || "-",
            serviceSummary: serviceSummary || "Layanan Laundry",
            stage: (wi?.stage || "QUEUED") as WorkStage,
            custodyState: row.custody_state || "IN_CUSTODY",
            initialChargesIdr: Number(row.total_charges_idr) || 0,
            creditAdjustmentsIdr: 0,
            confirmedReceiptsIdr: Number(row.paid_amount_idr) || 0,
            rackCode: pkg?.rack_code,
            pending: pendingAttempt ? {
              id: pendingAttempt.id,
              amountIdr: Number(pendingAttempt.amount_idr),
              method: pendingAttempt.method,
              reference: pendingAttempt.reference || "",
            } : undefined,
            acceptedAt: row.accepted_at,
            promisedAt: row.current_promised_at,
          };
        });
        setOrders(mapped);
      }
    } catch {
      // keep fallback
    } finally {
      setIsLoading(false);
    }
  }, [activeOutlet?.id]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;

  const filteredOrders = orders.filter((o) => {
    const q = searchQuery.toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.customerPhone.toLowerCase().includes(q)
    );
  });

  const openPayment = (order: OrderListItem) => {
    const { balanceIdr } = ledgerOf(order);
    setSelectedId(order.id);
    setAppliedInput(String(Math.max(0, balanceIdr)));
    setTenderedInput(String(Math.max(0, balanceIdr)));
    setReferenceInput("");
    setPaymentMethod("CASH");
    setPaymentError("");
    setIsPaymentOpen(true);
  };

  const confirmPayment = async () => {
    if (!selectedOrder) return;
    const applied = parseInt(appliedInput, 10) || 0;
    if (applied <= 0) {
      setPaymentError("Jumlah yang dibayarkan harus lebih dari 0.");
      return;
    }

    setIsPaymentSubmitting(true);
    setPaymentError("");

    const idemScope = `payment:${selectedOrder.id}`;
    const idempotencyKey = idem.key(idemScope);

    try {
      if (entersLedgerImmediately(paymentMethod)) {
        const tendered = parseInt(tenderedInput, 10) || 0;
        if (tendered < applied) {
          setPaymentError("Uang diterima lebih kecil dari jumlah yang dibayarkan.");
          setIsPaymentSubmitting(false);
          return;
        }

        await apiFetch(`/api/orders/${selectedOrder.id}/cash-receipts`, {
          method: "POST",
          idempotencyKey,
          body: JSON.stringify({
            applied_idr: applied,
            tendered_idr: tendered,
          }),
        });

        setOrders((prev) =>
          prev.map((o) =>
            o.id === selectedOrder.id ? { ...o, confirmedReceiptsIdr: o.confirmedReceiptsIdr + applied } : o
          )
        );
      } else {
        const res = await apiFetch<{ attempt_id: string }>(`/api/orders/${selectedOrder.id}/payment-attempts`, {
          method: "POST",
          idempotencyKey,
          body: JSON.stringify({
            method: paymentMethod,
            amount_idr: applied,
            reference: referenceInput.trim() || null,
          }),
        });

        setOrders((prev) =>
          prev.map((o) =>
            o.id === selectedOrder.id
              ? { ...o, pending: { id: res?.attempt_id, amountIdr: applied, method: paymentMethod, reference: referenceInput.trim() } }
              : o
          )
        );
      }

      idem.reset(idemScope);
      setIsPaymentOpen(false);
      setSelectedId(null);
    } catch (err: any) {
      setPaymentError(err.message || "Gagal mencatat pembayaran.");
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  /** FR26 — staff checked the bank/payment activity, so the attempt becomes a receipt. */
  const verifyPending = async (orderId: string, pendingAttempt?: PendingAttempt) => {
    try {
      if (pendingAttempt?.id) {
        await apiFetch(`/api/payment-attempts/${pendingAttempt.id}/confirm`, {
          method: "POST",
          idempotencyKey: idem.key(`verify:${pendingAttempt.id}`),
          body: JSON.stringify({ action: "CONFIRM" }),
        });
        idem.reset(`verify:${pendingAttempt.id}`);
      }

      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId && o.pending
            ? { ...o, confirmedReceiptsIdr: o.confirmedReceiptsIdr + o.pending.amountIdr, pending: undefined }
            : o
        )
      );
      setFeedback({
        isOpen: true,
        type: "success",
        title: "Pembayaran Diverifikasi",
        message: "Dana transfer/QRIS berhasil dicocokkan dan dicatat ke buku besar saldo order.",
      });
    } catch (err: any) {
      setFeedback({
        isOpen: true,
        type: "error",
        title: "Verifikasi Gagal",
        message: err.message || "Gagal memverifikasi bukti pembayaran.",
      });
    }
  };

  const rejectPending = async (orderId: string, pendingAttempt?: PendingAttempt) => {
    try {
      if (pendingAttempt?.id) {
        await apiFetch(`/api/payment-attempts/${pendingAttempt.id}/reject`, {
          method: "POST",
          idempotencyKey: idem.key(`reject:${pendingAttempt.id}`),
          body: JSON.stringify({ reason: "Ditolak kasir: Bukti transfer tidak valid" }),
        });
        idem.reset(`reject:${pendingAttempt.id}`);
      }

      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, pending: undefined } : o)));
      setFeedback({
        isOpen: true,
        type: "info",
        title: "Pembayaran Ditolak",
        message: "Status transfer yang tidak valid telah ditolak.",
      });
    } catch (err: any) {
      setFeedback({
        isOpen: true,
        type: "error",
        title: "Gagal Menolak",
        message: err.message || "Terjadi kesalahan saat memproses penolakan.",
      });
    }
  };

  const openHandover = (order: OrderListItem) => {
    setSelectedId(order.id);
    setReceiverName(order.customerName);
    setIsRepresentative(false);
    setReceiverError("");
    setAllowCreditApproval(false);
    setCreditReason("");
    setCreditError("");
    setIsHandoverOpen(true);
  };

  const confirmHandover = async () => {
    if (!selectedOrder) return;
    if (!receiverName.trim()) {
      setReceiverError("Nama penerima fisik wajib dicatat.");
      return;
    }
    const { balanceIdr } = ledgerOf(selectedOrder);
    if (balanceIdr > 0 && allowCreditApproval && !creditReason.trim()) {
      setCreditError("Alasan persetujuan kredit wajib dicatat untuk audit.");
      return;
    }

    setIsHandoverSubmitting(true);
    setReceiverError("");

    const idemScope = `handover:${selectedOrder.id}`;

    try {
      await apiFetch(`/api/orders/${selectedOrder.id}/handover`, {
        method: "POST",
        idempotencyKey: idem.key(idemScope),
        body: JSON.stringify({
          expected_version: selectedOrder.version,
          receiver_name: receiverName.trim(),
          is_representative: isRepresentative,
          credit_reason: balanceIdr > 0 ? creditReason.trim() : null,
        }),
      });

      setOrders((prev) =>
        prev.map((o) => (o.id === selectedOrder.id ? { ...o, custodyState: "HANDED_OVER" } : o))
      );
      idem.reset(idemScope);
      setIsHandoverOpen(false);
      setSelectedId(null);
    } catch (err: any) {
      setReceiverError(err.message || "Gagal serah terima cucian.");
    } finally {
      setIsHandoverSubmitting(false);
    }
  };

  const selectedLedger = selectedOrder ? ledgerOf(selectedOrder) : null;
  const overLimit = !!selectedLedger && selectedLedger.balanceIdr > CREDIT_LIMIT_IDR;
  const handoverBlocked =
    !!selectedOrder &&
    !!selectedLedger &&
    (selectedOrder.stage !== "READY" ||
      (selectedLedger.balanceIdr > 0 && (!allowCreditApproval || overLimit)));

  const pendingCount = orders.filter((o) => o.pending).length;

  return (
    <PageShell>
      <TopBar
        width="wide"
        title="Daftar Order & Serah Terima"
        subtitle="Empat status terpisah: siklus · tahap kerja · fisik · pembayaran"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadOrders} disabled={isLoading}>
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button asChild size="sm">
              <Link href="/cashier/new-order">+ Order Baru</Link>
            </Button>
          </div>
        }
      />

      <PageBody width="wide">
        <SectionHead
          eyebrow="Front Desk"
          title="Order Berjalan"
          description="Cucian dilepas hanya bila tahap kerja sudah Siap Diambil dan saldo nol, kecuali ada persetujuan kredit bernilai terbatas dari owner/supervisor."
          actions={
            <SearchInput
              icon={<Search className="size-4" />}
              placeholder="Cari no. struk, nama, atau no HP..."
              aria-label="Cari order"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-72"
            />
          }
        />

        {pendingCount > 0 && (
          <Notice
            tone="warning"
            icon={<ShieldCheck className="size-5" />}
          >
            <span className="block font-bold">
              Ada {pendingCount} pembayaran transfer/QRIS menunggu verifikasi
            </span>
            <span className="block text-xs">
              Uang belum dihitung ke saldo order sampai supervisor atau kasir mencocokkan mutasi rekening.
            </span>
          </Notice>
        )}

        <div className="space-y-4">
          {filteredOrders.length === 0 ? (
            <Card pad="lg" className="text-center text-ink-muted">
              Tidak ada order yang cocok dengan pencarian.
            </Card>
          ) : (
            filteredOrders.map((order) => {
              const ledger = ledgerOf(order);
              const isSettled = ledger.settlement === "SETTLED";
              const isHandedOver = order.custodyState === "HANDED_OVER";
              const isReady = order.stage === "READY";

              return (
                <Card
                  key={order.id}
                  pad="none"
                  className="overflow-hidden transition-all hover:border-line-strong"
                >
                  <div className="flex flex-col gap-4 border-b border-line bg-sunken/40 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="num font-mono text-sm font-extrabold tracking-wide">
                        {order.orderNumber}
                      </span>
                      <Badge variant={isReady ? "success" : "accent"}>
                        {STAGE_LABEL[order.stage]}
                      </Badge>
                      <Badge variant={isSettled ? "success" : "warning"}>
                        {SETTLEMENT_LABEL[ledger.settlement]}
                      </Badge>
                      <Badge variant={isHandedOver ? "muted" : "ink"}>
                        {isHandedOver ? "Sudah Diambil" : "Di Outlet"}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isSettled && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openPayment(order)}
                        >
                          <Wallet className="size-3.5" /> Pelunasan
                        </Button>
                      )}
                      {!isHandedOver && (
                        <Button
                          size="sm"
                          variant={isReady && isSettled ? "solid" : "outline"}
                          onClick={() => openHandover(order)}
                        >
                          <PackageCheck className="size-3.5" /> Serah Terima
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                        Pelanggan
                      </span>
                      <div className="mt-1 font-bold text-ink">{order.customerName}</div>
                      <div className="num font-mono text-xs text-ink-muted">
                        {order.customerPhone}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                        Layanan
                      </span>
                      <div className="mt-1 text-sm font-semibold text-ink">
                        {order.serviceSummary}
                      </div>
                      {order.rackCode && (
                        <div className="mt-1 text-xs font-bold text-ok">
                          Rak: {order.rackCode}
                        </div>
                      )}
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                        Posisi Keuangan (C / N)
                      </span>
                      <div className="num mt-1 font-mono text-xs text-ink-muted">
                        Tagihan (C): {formatRupiah(ledger.netChargesIdr)}
                      </div>
                      <div className="num font-mono text-xs text-ink-muted">
                        Diterima (N): {formatRupiah(ledger.netReceivedIdr)}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">
                        Sisa Tagihan
                      </span>
                      <div
                        className={`num mt-1 font-mono text-lg font-black ${
                          ledger.balanceIdr > 0 ? "text-warn" : "text-ok"
                        }`}
                      >
                        {ledger.balanceIdr === 0
                          ? "LUNAS"
                          : formatRupiah(ledger.balanceIdr)}
                      </div>
                    </div>
                  </div>

                  {order.pending && (
                    <div className="flex flex-col gap-3 border-t border-line bg-warn-soft/40 p-4 text-xs sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2 text-ink">
                        <AlertCircle className="size-4 shrink-0 text-warn" />
                        <span>
                          Pending {order.pending.method}:{" "}
                          <strong>{formatRupiah(order.pending.amountIdr)}</strong> · Ref:{" "}
                          <span className="font-mono">{order.pending.reference || "Tanpa Ref"}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="solid"
                          onClick={() => verifyPending(order.id, order.pending)}
                        >
                          Cocok & Konfirmasi
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => rejectPending(order.id, order.pending)}
                        >
                          Tolak
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>

        {/* Modal Pelunasan */}
        <Modal
          open={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          title="Pelunasan Tagihan"
          description={`Order ${selectedOrder?.orderNumber} · ${selectedOrder?.customerName}`}
        >
          {paymentError && (
            <div className="p-3 mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 text-amber-600 shrink-0" />
              <span>{paymentError}</span>
            </div>
          )}

          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-xs font-bold text-ink-soft">Metode Pembayaran</legend>
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
            </fieldset>

            <Field label="Nominal Dibayarkan (IDR)">
              <Input
                type="number"
                inputMode="numeric"
                value={appliedInput}
                onChange={(e) => setAppliedInput(e.target.value)}
                className="num font-bold"
              />
            </Field>

            {entersLedgerImmediately(paymentMethod) ? (
              <Field label="Uang Diterima (IDR)" hint="Kelebihan menjadi uang kembalian">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={tenderedInput}
                  onChange={(e) => setTenderedInput(e.target.value)}
                  className="num font-bold"
                />
              </Field>
            ) : (
              <Field label="Referensi / Kode Transaksi" hint="Nomor ref mutasi bank / QRIS">
                <Input
                  value={referenceInput}
                  onChange={(e) => setReferenceInput(e.target.value)}
                  placeholder="Contoh: BCA 14:22 / QRIS 0098"
                />
              </Field>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsPaymentOpen(false)}>
                Batal
              </Button>
              <Button onClick={confirmPayment} disabled={isPaymentSubmitting}>
                {isPaymentSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Menyimpan...
                  </>
                ) : (
                  "Konfirmasi Pembayaran"
                )}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Modal Serah Terima */}
        <Modal
          open={isHandoverOpen}
          onClose={() => setIsHandoverOpen(false)}
          title="Serah Terima Cucian"
          description={`Order ${selectedOrder?.orderNumber} · ${selectedOrder?.customerName}`}
        >
          {receiverError && (
            <div className="p-3 mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 text-amber-600 shrink-0" />
              <span>{receiverError}</span>
            </div>
          )}

          {creditError && (
            <div className="p-3 mb-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <AlertCircle className="size-4 text-amber-600 shrink-0" />
              <span>{creditError}</span>
            </div>
          )}

          <div className="space-y-4">
            <Field label="Nama Penerima Fisik" required>
              <Input
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                placeholder="Nama orang yang mengambil pakaian"
              />
            </Field>

            <label className="flex items-center gap-2 text-xs font-semibold text-ink">
              <input
                type="checkbox"
                checked={isRepresentative}
                onChange={(e) => setIsRepresentative(e.target.checked)}
                className="size-4 rounded"
              />
              Diambil oleh perwakilan / kurir (Bukan pelanggan langsung)
            </label>

            {selectedLedger && selectedLedger.balanceIdr > 0 && (
              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-xs">
                <div className="font-bold text-amber-900">
                  Perhatian: Order masih memiliki sisa tagihan {formatRupiah(selectedLedger.balanceIdr)}
                </div>
                <p className="text-amber-800">
                  Pelepasan pakaian dengan piutang harus mendapatkan izin owner/supervisor dan dicatat alasannya.
                </p>

                <label className="flex items-center gap-2 font-bold text-amber-950">
                  <input
                    type="checkbox"
                    checked={allowCreditApproval}
                    onChange={(e) => setAllowCreditApproval(e.target.checked)}
                    className="size-4 rounded"
                  />
                  Setujui pelepasan kredit / piutang
                </label>

                {allowCreditApproval && (
                  <Field label="Alasan Persetujuan Kredit" required>
                    <Input
                      value={creditReason}
                      onChange={(e) => setCreditReason(e.target.value)}
                      placeholder="Contoh: Langganan bulanan / Bayar saat gajian"
                    />
                  </Field>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setIsHandoverOpen(false)}>
                Batal
              </Button>
              <Button onClick={confirmHandover} disabled={isHandoverSubmitting}>
                {isHandoverSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Menyimpan...
                  </>
                ) : (
                  "Konfirmasi Serah Terima"
                )}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Global Feedback Modal */}
        <FeedbackModal
          state={feedback}
          onClose={() => setFeedback((prev) => ({ ...prev, isOpen: false }))}
        />
      </PageBody>
    </PageShell>
  );
}
