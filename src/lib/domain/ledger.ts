import type { PaymentMethod, SettlementStatus, WorkStage } from "@/types";

/* =============================================================================
   PRD §9.2 — operational ledger. Settlement is DERIVED, never a manual toggle
   (§6.1). Every amount here is integer rupiah.
   ============================================================================= */

export interface LedgerInput {
  initialChargesIdr: number;
  debitAdjustmentsIdr?: number;
  creditAdjustmentsIdr?: number;
  confirmedReceiptsIdr: number;
  confirmedRefundsIdr?: number;
  receiptReversalsIdr?: number;
}

export interface LedgerState {
  netChargesIdr: number; // C
  netReceivedIdr: number; // N
  balanceIdr: number; // C - N
  settlement: SettlementStatus;
}

export function computeLedger(input: LedgerInput): LedgerState {
  const {
    initialChargesIdr,
    debitAdjustmentsIdr = 0,
    creditAdjustmentsIdr = 0,
    confirmedReceiptsIdr,
    confirmedRefundsIdr = 0,
    receiptReversalsIdr = 0,
  } = input;

  // C never goes negative (§6.3 invariant 3). Reduce the bill with credits, not below zero.
  const netChargesIdr = Math.max(0, initialChargesIdr + debitAdjustmentsIdr - creditAdjustmentsIdr);
  const netReceivedIdr = confirmedReceiptsIdr - confirmedRefundsIdr - receiptReversalsIdr;
  const balanceIdr = netChargesIdr - netReceivedIdr;

  return {
    netChargesIdr,
    netReceivedIdr,
    balanceIdr,
    settlement: deriveSettlement(netChargesIdr, netReceivedIdr),
  };
}

export function deriveSettlement(netChargesIdr: number, netReceivedIdr: number): SettlementStatus {
  const balance = netChargesIdr - netReceivedIdr;
  if (balance < 0) return "CREDIT_DUE";
  if (balance > 0) return netReceivedIdr > 0 ? "PARTIAL" : "UNPAID";
  return netChargesIdr === 0 ? "ZERO_CHARGE" : "SETTLED";
}

export const SETTLEMENT_LABEL: Record<SettlementStatus, string> = {
  UNPAID: "Belum Bayar",
  PARTIAL: "Bayar Sebagian",
  SETTLED: "Lunas",
  CREDIT_DUE: "Kelebihan Bayar",
  ZERO_CHARGE: "Tanpa Tagihan",
};

/* --------------------------------------------------------------- payments --- */

/** §6.1 — non-cash attempts stay PENDING_VERIFICATION and never enter N until
 *  staff check the bank/payment activity themselves (FR26). */
export function entersLedgerImmediately(method: PaymentMethod): boolean {
  return method === "CASH";
}

/** §9.2 — over-tender is change, not an overpayment. The receipt records only
 *  the amount applied to the bill. */
export function computeCashChange(appliedIdr: number, tenderedIdr: number): number {
  return Math.max(0, tenderedIdr - appliedIdr);
}

/* ------------------------------------------------------------ cash session --- */

export interface CashSessionInput {
  openingFloatIdr: number;
  cashReceiptsIdr: number;
  cashExpensesIdr: number;
  cashRefundsIdr?: number;
  authorizedCashInIdr?: number;
  authorizedCashOutIdr?: number;
  sessionCorrectionsIdr?: number;
}

/** §9.5 — transfer/QRIS never increases physical cash, so it is absent here. */
export function computeExpectedCash(i: CashSessionInput): number {
  return (
    i.openingFloatIdr +
    i.cashReceiptsIdr +
    (i.authorizedCashInIdr ?? 0) -
    (i.cashRefundsIdr ?? 0) -
    i.cashExpensesIdr -
    (i.authorizedCashOutIdr ?? 0) +
    (i.sessionCorrectionsIdr ?? 0)
  );
}

/* -------------------------------------------------------------- production --- */

/** §5.3 — the next stage comes from the work item's own workflow snapshot, so an
 *  iron-only job never gets routed through washing. */
export function nextStage(workflow: WorkStage[], current: WorkStage): WorkStage | null {
  const i = workflow.indexOf(current);
  if (i < 0 || i >= workflow.length - 1) return null;
  return workflow[i + 1];
}

export const STAGE_LABEL: Record<WorkStage, string> = {
  QUEUED: "Antrean",
  WASHING: "Pencucian",
  DRYING: "Pengeringan",
  IRONING: "Penyetrikaan",
  FOLDING: "Pelipatan",
  QC: "Pemeriksaan QC",
  READY: "Siap Diambil",
  CANCELLED: "Dibatalkan",
};
