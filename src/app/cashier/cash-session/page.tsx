"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { PageBody, PageShell, SectionHead, TopBar } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { DataRow, Notice, StatTile } from "@/components/ui/stat";
import { computeExpectedCash } from "@/lib/domain/ledger";
import { apiFetch } from "@/lib/api/client";
import { formatRupiah } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  Plus,
  Receipt,
  RefreshCw,
  ShieldCheck,
  WalletMinimal,
} from "lucide-react";
import { useAuth } from "@/lib/supabase/auth-context";

/* =============================================================================
   PRD §9.5 — kas seharusnya = modal awal + penerimaan tunai + kas masuk resmi
   − refund tunai − pengeluaran tunai − kas keluar resmi.
   Transfer/QRIS tidak pernah menambah uang di laci; ia ditampilkan terpisah.
   Semua angka berasal dari server; halaman ini tidak mengarang nominal.
   ============================================================================= */

interface ExpenseRow {
  id: string;
  category: string;
  amount_idr: number;
  notes: string | null;
  created_at: string;
  actor_name: string | null;
}

interface CashSessionSnapshot {
  session: {
    id: string;
    status: string;
    opened_at: string;
    opened_by_name: string | null;
    opening_float_idr: number;
    notes: string | null;
  } | null;
  cash_receipts_idr?: number;
  cash_refunds_idr?: number;
  cash_expenses_idr?: number;
  other_cash_in_idr?: number;
  other_cash_out_idr?: number;
  expected_cash_idr?: number;
  non_cash_idr?: number;
  expenses?: ExpenseRow[];
}

interface CloseResult {
  session_id: string;
  opening_float_idr: number;
  cash_in_idr: number;
  cash_out_idr: number;
  expected_cash_idr: number;
  actual_cash_idr: number;
  discrepancy_idr: number;
}

const EXPENSE_CATEGORIES = [
  { value: "Bahan Baku & Sabun", label: "Bahan Baku & Sabun", hint: "Deterjen, pewangi, plastik packing" },
  { value: "Konsumsi & Operasional", label: "Konsumsi & Operasional", hint: "Uang makan, transport" },
  { value: "Perbaikan & Listrik", label: "Perbaikan & Listrik", hint: "Servis mesin, token listrik" },
  { value: "Lain-lain", label: "Lain-lain" },
];

/** §13.1 — kode yang belum punya salinan bahasa Indonesia di lapisan API. */
const EXTRA_MESSAGES: Record<string, string> = {
  active_session_already_exists: "Outlet ini sudah punya sesi kas yang terbuka. Muat ulang halaman dulu.",
  float_cannot_be_negative: "Modal kas awal tidak boleh negatif.",
  cash_forbidden: "Peran Anda tidak berwenang membuka sesi laci kas.",
  expense_forbidden: "Peran Anda tidak berwenang mencatat pengeluaran kas.",
  close_session_forbidden: "Sesi ini hanya bisa ditutup oleh kasir pembukanya, supervisor, atau owner.",
  review_forbidden: "Hanya supervisor atau owner yang bisa menandai selisih sudah ditinjau.",
  session_already_closed: "Sesi kas ini sudah ditutup.",
  session_not_closed: "Sesi kas ini belum ditutup.",
  session_not_found: "Sesi kas tidak ditemukan.",
  actual_cash_invalid: "Hitungan uang fisik tidak valid.",
};

function errorText(error: unknown): string {
  const err = error as { code?: string; message?: string };
  return (err?.code && EXTRA_MESSAGES[err.code]) || err?.message || "Terjadi kesalahan. Coba lagi.";
}

function timeOf(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export default function CashSessionPage() {
  const { activeOutlet, role } = useAuth();

  const [snapshot, setSnapshot] = useState<CashSessionSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  /* §13.3 — satu kunci idempotensi per aksi pengguna, dipakai ulang saat gagal
     lalu dicoba lagi, dan baru dibuang setelah server menerimanya. */
  const keys = useRef<Record<string, string>>({});
  const keyFor = (action: string) => (keys.current[action] ??= crypto.randomUUID());
  const dropKey = (action: string) => {
    delete keys.current[action];
  };

  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [openingFloatInput, setOpeningFloatInput] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const [openError, setOpenError] = useState("");
  const [isOpening, setIsOpening] = useState(false);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState(EXPENSE_CATEGORIES[0].value);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [expenseError, setExpenseError] = useState("");
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [actualPhysicalCashInput, setActualPhysicalCashInput] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [closingError, setClosingError] = useState("");
  const [isClosing, setIsClosing] = useState(false);

  const [closedSummary, setClosedSummary] = useState<(CloseResult & { notes: string }) | null>(null);
  const [reviewedBySupervisor, setReviewedBySupervisor] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);

  const load = useCallback(async () => {
    if (!activeOutlet?.id) return;
    setIsLoading(true);
    setLoadError("");
    try {
      const data = await apiFetch<CashSessionSnapshot>(
        `/api/cash-sessions/active?outlet_id=${encodeURIComponent(activeOutlet.id)}`
      );
      setSnapshot(data);
    } catch (error) {
      setSnapshot(null);
      setLoadError(errorText(error));
    } finally {
      setIsLoading(false);
    }
  }, [activeOutlet?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const session = snapshot?.session ?? null;
  const expenses = snapshot?.expenses ?? [];

  const openingFloatIdr = session?.opening_float_idr ?? 0;
  const cashReceiptsIdr = snapshot?.cash_receipts_idr ?? 0;
  const cashRefundsIdr = snapshot?.cash_refunds_idr ?? 0;
  const cashExpensesIdr = snapshot?.cash_expenses_idr ?? 0;
  const otherCashInIdr = snapshot?.other_cash_in_idr ?? 0;
  const otherCashOutIdr = snapshot?.other_cash_out_idr ?? 0;
  const nonCashIdr = snapshot?.non_cash_idr ?? 0;

  /* Tampilan memakai rumus domain yang sama dengan server (§9.5). Angka final
     saat closing tetap datang dari respons server, bukan dari sini. */
  const expectedCashIdr = computeExpectedCash({
    openingFloatIdr,
    cashReceiptsIdr,
    cashRefundsIdr,
    cashExpensesIdr,
    authorizedCashInIdr: otherCashInIdr,
    authorizedCashOutIdr: otherCashOutIdr,
  });

  const draftActual = parseInt(actualPhysicalCashInput, 10) || 0;
  const draftDiscrepancy = draftActual - expectedCashIdr;

  const handleOpenSession = async () => {
    const float = parseInt(openingFloatInput, 10);
    if (!Number.isFinite(float) || float < 0) {
      setOpenError("Isi modal kas awal hasil hitungan fisik (boleh 0).");
      return;
    }
    if (!activeOutlet?.id) {
      setOpenError("Outlet aktif belum terpilih.");
      return;
    }
    setIsOpening(true);
    setOpenError("");
    try {
      await apiFetch("/api/cash-sessions", {
        method: "POST",
        idempotencyKey: keyFor("open"),
        body: JSON.stringify({
          outlet_id: activeOutlet.id,
          opening_float_idr: float,
          notes: openNotes.trim() || null,
        }),
      });
      dropKey("open");
      setIsOpenModalOpen(false);
      setOpeningFloatInput("");
      setOpenNotes("");
      setClosedSummary(null);
      setReviewedBySupervisor(false);
      await load();
    } catch (error) {
      setOpenError(errorText(error));
    } finally {
      setIsOpening(false);
    }
  };

  const handleAddExpense = async () => {
    const amount = parseInt(expenseAmount, 10) || 0;
    if (amount <= 0) {
      setExpenseError("Nominal pengeluaran harus lebih dari 0.");
      return;
    }
    if (!session || !activeOutlet?.id) return;

    setIsSavingExpense(true);
    setExpenseError("");
    try {
      await apiFetch(`/api/cash-sessions/${session.id}/expenses`, {
        method: "POST",
        idempotencyKey: keyFor("expense"),
        body: JSON.stringify({
          outlet_id: activeOutlet.id,
          category: expenseCategory,
          amount_idr: amount,
          notes: expenseNotes.trim() || null,
        }),
      });
      dropKey("expense");
      setIsExpenseModalOpen(false);
      setExpenseAmount("");
      setExpenseNotes("");
      await load();
    } catch (error) {
      setExpenseError(errorText(error));
    } finally {
      setIsSavingExpense(false);
    }
  };

  const handleConfirmCloseSession = async () => {
    if (!session) return;
    if (actualPhysicalCashInput.trim() === "" || draftActual < 0) {
      setClosingError("Isi hasil hitungan uang fisik terlebih dahulu.");
      return;
    }
    // §8.2 — selisih tidak pernah ditelan diam-diam; keterangan wajib.
    if (draftDiscrepancy !== 0 && !closingNotes.trim()) {
      setClosingError("Ada selisih kas. Tulis keterangan untuk supervisor sebelum menutup sesi.");
      return;
    }

    setIsClosing(true);
    setClosingError("");
    try {
      const result = await apiFetch<CloseResult>(`/api/cash-sessions/${session.id}/close`, {
        method: "POST",
        idempotencyKey: keyFor("close"),
        body: JSON.stringify({
          actual_cash_idr: draftActual,
          notes: closingNotes.trim() || null,
        }),
      });
      dropKey("close");
      setClosedSummary({ ...result, notes: closingNotes.trim() });
      setReviewedBySupervisor(false);
      setIsClosingModalOpen(false);
      setActualPhysicalCashInput("");
      setClosingNotes("");
      await load();
    } catch (error) {
      setClosingError(errorText(error));
    } finally {
      setIsClosing(false);
    }
  };

  /** §8.2 — supervisor hanya menandai sudah ditinjau; selisih tetap tercatat. */
  const handleReview = async () => {
    if (!closedSummary) return;
    setIsReviewing(true);
    setReviewError("");
    try {
      await apiFetch(`/api/cash-sessions/${closedSummary.session_id}/review`, {
        method: "POST",
        idempotencyKey: keyFor("review"),
        body: JSON.stringify({}),
      });
      dropKey("review");
      setReviewedBySupervisor(true);
    } catch (error) {
      setReviewError(errorText(error));
    } finally {
      setIsReviewing(false);
    }
  };

  const canReview = role === "owner" || role === "supervisor";

  return (
    <PageShell>
      <TopBar
        width="wide"
        title="Laci Kas & Closing Shift"
        subtitle={`Rekonsiliasi Kas Harian · ${activeOutlet?.name || "Outlet"}`}
        actions={
          <div className="flex items-center gap-3">
            <Badge variant={session ? "success" : "muted"}>{session ? "Sesi terbuka" : "Tidak ada sesi"}</Badge>
            <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} /> Muat ulang
            </Button>
          </div>
        }
      />

      <PageBody width="wide">
        <SectionHead
          eyebrow="Shift Berjalan"
          title="Rekonsiliasi Kas Harian"
          description="Kas fisik = modal awal + penerimaan tunai + kas masuk resmi − refund tunai − pengeluaran tunai − kas keluar resmi. Transfer dan QRIS tidak menambah uang di laci, jadi tidak masuk hitungan ini."
        />

        {loadError && (
          <Notice tone="danger" icon={<AlertCircle className="size-4" />}>
            <span>{loadError}</span>
            <Button variant="outline" size="sm" className="mt-2" onClick={load}>
              <RefreshCw className="size-3.5" /> Coba lagi
            </Button>
          </Notice>
        )}

        {closedSummary && (
          <Card tone="ink" pad="lg" className="space-y-6">
            <div className="flex items-center gap-2.5 font-bold">
              <CheckCircle2 className="size-5" /> Sesi kasir ditutup
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Kas seharusnya", value: formatRupiah(closedSummary.expected_cash_idr) },
                { label: "Kas fisik dihitung", value: formatRupiah(closedSummary.actual_cash_idr) },
                {
                  label: "Selisih",
                  value:
                    closedSummary.discrepancy_idr === 0
                      ? "Pas (Rp 0)"
                      : formatRupiah(closedSummary.discrepancy_idr),
                },
              ].map((s) => (
                <div key={s.label} className="rounded-control bg-white/10 p-5">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-white/50">{s.label}</span>
                  <span className="num mt-2 block text-xl font-extrabold">{s.value}</span>
                </div>
              ))}
            </div>

            {closedSummary.notes && (
              <p className="text-xs leading-relaxed text-white/60">Keterangan kasir: {closedSummary.notes}</p>
            )}

            {closedSummary.discrepancy_idr !== 0 && (
              <div className="flex flex-col gap-4 rounded-control bg-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <p className="text-xs leading-relaxed text-white/70">
                    Selisih tidak dihapus dan tidak dicatat otomatis sebagai pengeluaran. Supervisor menandainya sudah
                    ditinjau; catatan closing tetap tersimpan.
                  </p>
                  {reviewError && <p className="text-xs font-semibold text-white">{reviewError}</p>}
                </div>
                {reviewedBySupervisor ? (
                  <Badge variant="accent" className="shrink-0">
                    <ShieldCheck className="size-3.5" /> Sudah ditinjau supervisor
                  </Badge>
                ) : canReview ? (
                  <Button
                    size="sm"
                    variant="invert"
                    className="shrink-0"
                    onClick={handleReview}
                    disabled={isReviewing}
                  >
                    {isReviewing ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                    {isReviewing ? "Menyimpan..." : "Tandai Sudah Ditinjau"}
                  </Button>
                ) : (
                  <span className="shrink-0 text-xs text-white/60">Menunggu tinjauan supervisor.</span>
                )}
              </div>
            )}
          </Card>
        )}

        {isLoading && !snapshot ? (
          <Card pad="lg">
            <div className="flex items-center justify-center gap-3 py-10 text-sm text-ink-muted">
              <Loader2 className="size-5 animate-spin" /> Memuat sesi laci kas...
            </div>
          </Card>
        ) : !session ? (
          <Card pad="lg" className="space-y-6">
            <CardHeader>
              <CardTitle>Belum ada sesi laci kas yang terbuka</CardTitle>
              <CardDescription>
                Hitung uang di laci lebih dulu, lalu buka sesi dengan modal awal sesuai hitungan fisik. Satu laci hanya
                boleh punya satu sesi aktif, dan pembayaran tunai baru bisa dicatat setelah sesi terbuka.
              </CardDescription>
            </CardHeader>
            <Button size="lg" onClick={() => setIsOpenModalOpen(true)} disabled={!activeOutlet?.id}>
              <WalletMinimal className="size-4" /> Buka Sesi Kas
            </Button>
          </Card>
        ) : (
          <>
            {/* KPI */}
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Modal Kas Awal"
                value={formatRupiah(openingFloatIdr)}
                hint={`Dihitung fisik saat sesi dibuka · ${timeOf(session.opened_at)}${
                  session.opened_by_name ? ` · ${session.opened_by_name}` : ""
                }`}
              />
              <StatTile
                label="Penerimaan Tunai"
                value={formatRupiah(cashReceiptsIdr)}
                emphasis="positive"
                hint={<>Transfer/QRIS {formatRupiah(nonCashIdr)} tidak masuk laci</>}
              />
              <StatTile
                label="Keluar Tunai"
                value={formatRupiah(cashExpensesIdr + cashRefundsIdr + otherCashOutIdr)}
                emphasis="negative"
                hint={
                  <>
                    Pengeluaran {formatRupiah(cashExpensesIdr)} · refund {formatRupiah(cashRefundsIdr)}
                    {otherCashOutIdr > 0 ? ` · kas keluar resmi ${formatRupiah(otherCashOutIdr)}` : ""}
                  </>
                }
              />
              <StatTile
                label="Target Kas di Laci"
                value={formatRupiah(expectedCashIdr)}
                emphasis="primary"
                hint="Modal + tunai masuk − refund − pengeluaran"
              />
            </div>

            {/* Rincian rumus */}
            <Card pad="lg">
              <CardHeader>
                <CardTitle>Rincian Perhitungan</CardTitle>
                <CardDescription>
                  Setiap baris bisa ditelusuri ke transaksi sumbernya; ringkasan dan drill-down harus berjumlah sama.
                </CardDescription>
              </CardHeader>
              <div className="space-y-4">
                <DataRow label="Modal kas awal" value={formatRupiah(openingFloatIdr)} />
                <DataRow label="Penerimaan tunai" value={`+ ${formatRupiah(cashReceiptsIdr)}`} tone="positive" />
                {otherCashInIdr > 0 && (
                  <DataRow label="Kas masuk resmi" value={`+ ${formatRupiah(otherCashInIdr)}`} tone="positive" />
                )}
                <DataRow label="Refund tunai" value={`− ${formatRupiah(cashRefundsIdr)}`} tone="negative" />
                <DataRow label="Pengeluaran tunai" value={`− ${formatRupiah(cashExpensesIdr)}`} tone="negative" />
                {otherCashOutIdr > 0 && (
                  <DataRow label="Kas keluar resmi" value={`− ${formatRupiah(otherCashOutIdr)}`} tone="negative" />
                )}
                <div className="border-t border-line pt-4">
                  <DataRow label="Kas seharusnya di laci" value={formatRupiah(expectedCashIdr)} strong />
                </div>
                <DataRow
                  label="Transfer / QRIS sejak sesi dibuka"
                  value={`${formatRupiah(nonCashIdr)} · di luar laci`}
                  className="text-ink-faint"
                />
              </div>
            </Card>

            {/* Pengeluaran */}
            <Card pad="lg">
              <CardHeader className="flex flex-row items-start justify-between gap-6">
                <div className="space-y-1.5">
                  <CardTitle>Pengeluaran Kas Kecil</CardTitle>
                  <CardDescription>
                    Koreksi memakai pembalikan, bukan penghapusan. Bukti foto opsional.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setExpenseError("");
                    setIsExpenseModalOpen(true);
                  }}
                >
                  <Plus className="size-4" /> Catat
                </Button>
              </CardHeader>

              {expenses.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-muted">Belum ada pengeluaran pada shift ini.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {expenses.map((exp) => (
                    <li key={exp.id} className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">{exp.category}</div>
                        <div className="mt-0.5 truncate text-xs text-ink-muted">
                          {exp.notes || "Tanpa keterangan"} · {timeOf(exp.created_at)}
                          {exp.actor_name ? ` · ${exp.actor_name}` : ""}
                        </div>
                      </div>
                      <span className="num shrink-0 font-bold text-danger">-{formatRupiah(exp.amount_idr)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 border-t border-line pt-6">
                <DataRow
                  label="Total pengeluaran tunai"
                  value={`-${formatRupiah(cashExpensesIdr)}`}
                  strong
                  tone="negative"
                />
              </div>
            </Card>

            <div className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
              <p className="max-w-lg text-xs leading-relaxed text-ink-muted">
                Satu laci hanya boleh punya satu sesi aktif. Refund tunai pada hari berikutnya masuk ke sesi hari itu,
                bukan membuka kembali sesi lama.
              </p>
              <Button
                size="lg"
                className="shrink-0"
                onClick={() => {
                  setActualPhysicalCashInput("");
                  setClosingNotes("");
                  setClosingError("");
                  setIsClosingModalOpen(true);
                }}
              >
                <Lock className="size-4" /> Tutup & Hitung Kas
              </Button>
            </div>
          </>
        )}
      </PageBody>

      {/* Buka sesi */}
      <Modal
        open={isOpenModalOpen}
        onClose={() => setIsOpenModalOpen(false)}
        eyebrow="Awal Shift"
        title="Buka Sesi Laci Kas"
        description="Modal awal adalah uang yang benar-benar ada di laci saat shift dimulai."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsOpenModalOpen(false)} disabled={isOpening}>
              Batal
            </Button>
            <Button onClick={handleOpenSession} disabled={isOpening}>
              {isOpening ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Membuka...
                </>
              ) : (
                <>
                  <WalletMinimal className="size-4" /> Buka Sesi
                </>
              )}
            </Button>
          </>
        }
      >
        <Field label="Modal kas awal (IDR)" required error={openError} hint="Isi hasil hitungan fisik, boleh 0.">
          <Input
            type="number"
            inputMode="numeric"
            autoFocus
            value={openingFloatInput}
            onChange={(e) => {
              setOpeningFloatInput(e.target.value);
              setOpenError("");
            }}
            placeholder="Contoh: 100000"
            className="num text-lg font-bold"
          />
        </Field>

        <Field label="Catatan pembukaan" hint="Opsional, misalnya nama kasir pengganti.">
          <Input
            value={openNotes}
            onChange={(e) => setOpenNotes(e.target.value)}
            placeholder="Catatan singkat untuk supervisor"
          />
        </Field>
      </Modal>

      {/* Tambah pengeluaran */}
      <Modal
        open={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        eyebrow="Kas Keluar"
        title="Catat Pengeluaran Kas"
        description="Uang tunai keluar langsung dari laci kas."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsExpenseModalOpen(false)} disabled={isSavingExpense}>
              Batal
            </Button>
            <Button variant="danger" onClick={handleAddExpense} disabled={isSavingExpense}>
              {isSavingExpense ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Menyimpan...
                </>
              ) : (
                <>
                  <Receipt className="size-4" /> Simpan Pengeluaran
                </>
              )}
            </Button>
          </>
        }
      >
        <Field label="Kategori">
          <Select value={expenseCategory} onValueChange={setExpenseCategory} options={EXPENSE_CATEGORIES} />
        </Field>

        <Field label="Nominal (IDR)" required error={expenseError}>
          <Input
            type="number"
            inputMode="numeric"
            value={expenseAmount}
            onChange={(e) => {
              setExpenseAmount(e.target.value);
              setExpenseError("");
            }}
            placeholder="Contoh: 25000"
            className="num font-bold"
          />
        </Field>

        <Field label="Keterangan" hint="Opsional, tapi memudahkan audit supervisor.">
          <Input
            value={expenseNotes}
            onChange={(e) => setExpenseNotes(e.target.value)}
            placeholder="Catatan keperluan uang keluar"
          />
        </Field>
      </Modal>

      {/* Closing */}
      <Modal
        open={isClosingModalOpen}
        onClose={() => setIsClosingModalOpen(false)}
        eyebrow="Akhir Shift"
        title="Closing Sesi Kasir"
        description="Hitung uang fisik dulu, baru bandingkan dengan angka sistem."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsClosingModalOpen(false)} disabled={isClosing}>
              Batal
            </Button>
            <Button onClick={handleConfirmCloseSession} disabled={isClosing}>
              {isClosing ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Menutup...
                </>
              ) : (
                "Konfirmasi Tutup Sesi"
              )}
            </Button>
          </>
        }
      >
        <Field label="Uang fisik dihitung (IDR)" required hint="Isi hasil hitungan sebelum melihat angka sistem.">
          <Input
            type="number"
            inputMode="numeric"
            autoFocus
            value={actualPhysicalCashInput}
            onChange={(e) => {
              setActualPhysicalCashInput(e.target.value);
              setClosingError("");
            }}
            placeholder="0"
            className="num text-lg font-bold"
          />
        </Field>

        <div className="space-y-3 rounded-control bg-sunken p-5">
          <DataRow label="Kas seharusnya menurut sistem" value={formatRupiah(expectedCashIdr)} />
          <div className="border-t border-line pt-3">
            <DataRow
              label="Selisih"
              value={draftDiscrepancy === 0 ? "Pas (Rp 0)" : formatRupiah(draftDiscrepancy)}
              strong
              tone={draftDiscrepancy === 0 ? "positive" : draftDiscrepancy < 0 ? "negative" : "warning"}
            />
          </div>
        </div>

        {draftDiscrepancy !== 0 && actualPhysicalCashInput !== "" && (
          <Notice tone="warning" icon={<AlertCircle className="size-4" />}>
            <span>
              Selisih tidak akan diubah menjadi pengeluaran otomatis. Sesi tetap ditutup dengan selisih tercatat, lalu
              supervisor meninjaunya.
            </span>
          </Notice>
        )}

        <Field
          label="Keterangan closing"
          required={draftDiscrepancy !== 0}
          error={closingError}
          hint="Wajib diisi bila ada selisih."
        >
          <Input
            value={closingNotes}
            onChange={(e) => {
              setClosingNotes(e.target.value);
              setClosingError("");
            }}
            placeholder="Contoh: kembalian kurang saat jam ramai"
          />
        </Field>
      </Modal>
    </PageShell>
  );
}
