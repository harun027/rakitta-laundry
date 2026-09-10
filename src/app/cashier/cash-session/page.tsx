"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { PageBody, PageShell, SectionHead, TopBar } from "@/components/ui/layout";
import { Modal } from "@/components/ui/modal";
import { DataRow, Notice, StatTile } from "@/components/ui/stat";
import { computeExpectedCash } from "@/lib/domain/ledger";
import { formatRupiah } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Lock, Plus, Receipt, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/supabase/auth-context";

interface ExpenseItem {
  id: string;
  category: string;
  amountIdr: number;
  notes: string;
  time: string;
}

const EXPENSE_CATEGORIES = [
  { value: "Bahan Baku & Sabun", label: "Bahan Baku & Sabun", hint: "Deterjen, pewangi, plastik packing" },
  { value: "Konsumsi & Operasional", label: "Konsumsi & Operasional", hint: "Uang makan, transport" },
  { value: "Perbaikan & Listrik", label: "Perbaikan & Listrik", hint: "Servis mesin, token listrik" },
  { value: "Lain-lain", label: "Lain-lain" },
];

/* PRD §9.5 worked example. Transfer/QRIS is shown but never enters expected cash. */
const OPENING_FLOAT = 100000;
const CASH_RECEIPTS_TOTAL = 300000;
const CASH_REFUNDS_TOTAL = 20000;
const NON_CASH_TOTAL = 200000;

export default function CashSessionPage() {
  const { activeOutlet } = useAuth();
  const [sessionStatus, setSessionStatus] = useState<"OPEN" | "CLOSED">("OPEN");
  const [expenses, setExpenses] = useState<ExpenseItem[]>([
    { id: "exp-1", category: "Bahan Baku & Sabun", amountIdr: 25000, notes: "Plastik packing 2 pak", time: "11:30" },
    { id: "exp-2", category: "Konsumsi & Operasional", amountIdr: 15000, notes: "Makan siang shift 1", time: "13:00" },
  ]);

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState(EXPENSE_CATEGORIES[0].value);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseError, setExpenseError] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");

  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [actualPhysicalCashInput, setActualPhysicalCashInput] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [closingError, setClosingError] = useState("");
  const [closedSummary, setClosedSummary] = useState<{
    expected: number;
    actual: number;
    discrepancy: number;
    notes: string;
  } | null>(null);
  const [reviewedBySupervisor, setReviewedBySupervisor] = useState(false);

  const totalExpenseIdr = expenses.reduce((sum, e) => sum + e.amountIdr, 0);
  const expectedCashIdr = computeExpectedCash({
    openingFloatIdr: OPENING_FLOAT,
    cashReceiptsIdr: CASH_RECEIPTS_TOTAL,
    cashRefundsIdr: CASH_REFUNDS_TOTAL,
    cashExpensesIdr: totalExpenseIdr,
  });

  const handleAddExpense = () => {
    const amt = parseInt(expenseAmount, 10) || 0;
    if (amt <= 0) {
      setExpenseError("Nominal pengeluaran harus lebih dari 0.");
      return;
    }
    setExpenses((prev) => [
      ...prev,
      {
        id: `exp-${Date.now()}`,
        category: expenseCategory,
        amountIdr: amt,
        notes: expenseNotes,
        time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setIsExpenseModalOpen(false);
    setExpenseAmount("");
    setExpenseNotes("");
    setExpenseError("");
  };

  const draftActual = parseInt(actualPhysicalCashInput, 10) || 0;
  const draftDiscrepancy = draftActual - expectedCashIdr;

  const handleConfirmCloseSession = () => {
    // §8.2 — a discrepancy is never silently absorbed; it needs an explanation.
    if (draftDiscrepancy !== 0 && !closingNotes.trim()) {
      setClosingError("Ada selisih kas. Tulis keterangan untuk supervisor sebelum menutup sesi.");
      return;
    }
    setClosedSummary({
      expected: expectedCashIdr,
      actual: draftActual,
      discrepancy: draftDiscrepancy,
      notes: closingNotes.trim(),
    });
    setSessionStatus("CLOSED");
    setIsClosingModalOpen(false);
  };

  return (
    <PageShell>
      <TopBar
        width="wide"
        title="Laci Kas & Closing Shift"
        subtitle={`Rekonsiliasi Kas Harian · ${activeOutlet?.name || "Outlet Surabaya"} (${activeOutlet?.timezone?.includes("Jakarta") ? "WIB" : "WITA"})`}
        actions={
          <Badge variant={sessionStatus === "OPEN" ? "success" : "muted"}>
            {sessionStatus === "OPEN" ? "Sesi terbuka" : "Sesi ditutup"}
          </Badge>
        }
      />

      <PageBody width="wide">
        <SectionHead
          eyebrow="Shift Berjalan"
          title="Rekonsiliasi Kas Harian"
          description="Kas fisik = modal awal + penerimaan tunai − refund tunai − pengeluaran tunai. Transfer dan QRIS tidak menambah uang di laci, jadi tidak masuk hitungan ini."
        />

        {sessionStatus === "CLOSED" && closedSummary && (
          <Card tone="ink" pad="lg" className="space-y-6">
            <div className="flex items-center gap-2.5 font-bold">
              <CheckCircle2 className="size-5" /> Sesi kasir ditutup
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Kas seharusnya", value: formatRupiah(closedSummary.expected) },
                { label: "Kas fisik dihitung", value: formatRupiah(closedSummary.actual) },
                {
                  label: "Selisih",
                  value: closedSummary.discrepancy === 0 ? "Pas (Rp 0)" : formatRupiah(closedSummary.discrepancy),
                },
              ].map((s) => (
                <div key={s.label} className="rounded-control bg-white/10 p-5">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-white/50">{s.label}</span>
                  <span className="num mt-2 block text-xl font-extrabold">{s.value}</span>
                </div>
              ))}
            </div>

            {closedSummary.notes && (
              <p className="text-xs leading-relaxed text-white/60">
                Keterangan kasir: {closedSummary.notes}
              </p>
            )}

            {closedSummary.discrepancy !== 0 && (
              <div className="flex flex-col gap-4 rounded-control bg-white/10 p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-relaxed text-white/70">
                  Selisih tidak dihapus dan tidak dicatat otomatis sebagai pengeluaran. Supervisor menandainya sudah
                  ditinjau; catatan closing tetap tersimpan.
                </p>
                {reviewedBySupervisor ? (
                  <Badge variant="accent" className="shrink-0">
                    <ShieldCheck className="size-3.5" /> Sudah ditinjau supervisor
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="invert"
                    className="shrink-0"
                    onClick={() => setReviewedBySupervisor(true)}
                  >
                    <ShieldCheck className="size-4" /> Tandai Sudah Ditinjau
                  </Button>
                )}
              </div>
            )}
          </Card>
        )}

        {/* KPI */}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Modal Kas Awal"
            value={formatRupiah(OPENING_FLOAT)}
            hint="Dihitung fisik saat sesi dibuka"
          />
          <StatTile
            label="Penerimaan Tunai"
            value={formatRupiah(CASH_RECEIPTS_TOTAL)}
            emphasis="positive"
            hint={<>Transfer/QRIS {formatRupiah(NON_CASH_TOTAL)} tidak masuk laci</>}
          />
          <StatTile
            label="Keluar Tunai"
            value={formatRupiah(totalExpenseIdr + CASH_REFUNDS_TOTAL)}
            emphasis="negative"
            hint={
              <>
                Pengeluaran {formatRupiah(totalExpenseIdr)} · refund {formatRupiah(CASH_REFUNDS_TOTAL)}
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
            <DataRow label="Modal kas awal" value={formatRupiah(OPENING_FLOAT)} />
            <DataRow label="Penerimaan tunai" value={`+ ${formatRupiah(CASH_RECEIPTS_TOTAL)}`} tone="positive" />
            <DataRow label="Refund tunai" value={`− ${formatRupiah(CASH_REFUNDS_TOTAL)}`} tone="negative" />
            <DataRow label="Pengeluaran tunai" value={`− ${formatRupiah(totalExpenseIdr)}`} tone="negative" />
            <div className="border-t border-line pt-4">
              <DataRow label="Kas seharusnya di laci" value={formatRupiah(expectedCashIdr)} strong />
            </div>
            <DataRow
              label="Transfer / QRIS hari ini"
              value={`${formatRupiah(NON_CASH_TOTAL)} · di luar laci`}
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
            {sessionStatus === "OPEN" && (
              <Button size="sm" variant="outline" onClick={() => setIsExpenseModalOpen(true)}>
                <Plus className="size-4" /> Catat
              </Button>
            )}
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
                      {exp.notes || "Tanpa keterangan"} · {exp.time} · Kasir Shift 1
                    </div>
                  </div>
                  <span className="num shrink-0 font-bold text-danger">-{formatRupiah(exp.amountIdr)}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 border-t border-line pt-6">
            <DataRow label="Total pengeluaran tunai" value={`-${formatRupiah(totalExpenseIdr)}`} strong tone="negative" />
          </div>
        </Card>

        {sessionStatus === "OPEN" && (
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
                setClosingError("");
                setIsClosingModalOpen(true);
              }}
            >
              <Lock className="size-4" /> Tutup & Hitung Kas
            </Button>
          </div>
        )}
      </PageBody>

      {/* Tambah pengeluaran */}
      <Modal
        open={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        eyebrow="Kas Keluar"
        title="Catat Pengeluaran Kas"
        description="Uang tunai keluar langsung dari laci kas."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsExpenseModalOpen(false)}>
              Batal
            </Button>
            <Button variant="danger" onClick={handleAddExpense}>
              <Receipt className="size-4" /> Simpan Pengeluaran
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
            <Button variant="outline" onClick={() => setIsClosingModalOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleConfirmCloseSession}>Konfirmasi Tutup Sesi</Button>
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
