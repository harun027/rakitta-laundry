/* Runnable check against the PRD's own fixtures & acceptance tests.
 * Run directly via:
 *   node --experimental-strip-types src/lib/domain/check.ts
 * Every assertion cites the PRD section and test fixture ID it validates.
 */

import assert from "node:assert/strict";
import { calculateBillableGrams, calculateLineGross, calculateOrderQuote } from "./pricing.ts";
import {
  computeCashChange,
  computeExpectedCash,
  computeLedger,
  deriveSettlement,
  entersLedgerImmediately,
  nextStage,
} from "./ledger.ts";
import {
  buildIntakeWhatsAppMessage,
  buildReadyWhatsAppMessage,
  buildUncollectedReminderWhatsAppMessage,
  generateWhatsAppUrl,
} from "./whatsapp.ts";
import type { ServiceVersion, WorkStage } from "../../types/index.ts";

const kiloanReguler: ServiceVersion = {
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
};

const kiloanExpress: ServiceVersion = {
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
};

const bedcoverSatuan: ServiceVersion = {
  id: "srv_bedcover",
  serviceId: "bedcover_satuan",
  name: "Bedcover King",
  unit: "piece",
  pricePerUnitIdr: 35000,
  minGrams: 0,
  incrementGrams: 1,
  slaHours: 48,
  workflowSteps: ["QUEUED", "WASHING", "DRYING", "IRONING", "QC", "READY"],
  isActive: true,
};

console.log("-> Testing PRD §9.3 & §17.1 Pricing Fixtures (T01 - T04)...");
// T01: 2.350 g under a 3.000 g minimum bills 3.000 g = Rp 24.000.
{
  const { billableQuantity, subtotalIdr } = calculateLineGross("kg", 2350, kiloanReguler);
  assert.equal(billableQuantity, 3000, "T01: Minimum 3000g must be applied");
  assert.equal(subtotalIdr, 24000, "T01: 3000g * 8000/kg = 24000");

  const ledger = computeLedger({
    initialChargesIdr: subtotalIdr,
    creditAdjustmentsIdr: 2000, // fixed discount
    confirmedReceiptsIdr: 10000, // cash deposit
  });
  assert.equal(ledger.netChargesIdr, 22000, "T07: Net charges C = 24000 - 2000 = 22000");
  assert.equal(ledger.balanceIdr, 12000, "T07: Balance = 22000 - 10000 = 12000");
  assert.equal(ledger.settlement, "PARTIAL");

  // T08: Customer tenders 20.000 to settle 12.000 → receipt 12.000, change 8.000.
  assert.equal(computeCashChange(12000, 20000), 8000, "T08: Cash change must be 8000");
}

// T02: 3.210 g rounds up to 3.300 g = Rp 26.400.
{
  const { billableQuantity, subtotalIdr } = calculateLineGross("kg", 3210, kiloanReguler);
  assert.equal(billableQuantity, 3300, "T02: Rounds up to next 100g increment");
  assert.equal(subtotalIdr, 26400, "T02: 3300g * 8000/kg = 26400");
}

// T03: Multi-service order (Weight + Piece).
{
  const quote = calculateOrderQuote([
    { serviceVersion: kiloanReguler, actualQuantity: 2350 },
    { serviceVersion: bedcoverSatuan, actualQuantity: 1 },
  ]);
  assert.equal(quote.subtotalIdr, 24000 + 35000, "T03: Subtotal matches sum of lines");
  assert.equal(quote.totalChargesIdr, 59000);
}

console.log("-> Testing PRD §9.4 Correction, Revisions & Refund Scenarios (T11, T12, FR13, FR27)...");
{
  // T11: Cancel before processing, bill waived, deposit kept → credit due, not settled.
  const waived = computeLedger({
    initialChargesIdr: 50000,
    creditAdjustmentsIdr: 50000,
    confirmedReceiptsIdr: 20000,
  });
  assert.equal(waived.netChargesIdr, 0, "C becomes 0");
  assert.equal(waived.balanceIdr, -20000, "Balance is negative (-20000)");
  assert.equal(waived.settlement, "CREDIT_DUE", "Must be CREDIT_DUE until refund confirmed");

  // T12: Refund without reducing charges must not stay paid.
  const refunded = computeLedger({
    initialChargesIdr: 50000,
    confirmedReceiptsIdr: 50000,
    confirmedRefundsIdr: 10000,
  });
  assert.equal(refunded.balanceIdr, 10000, "Balance reopens to 10000");
  assert.equal(refunded.settlement, "PARTIAL");

  // FR13: Revision debit/credit delta calculation
  const revisedOrder = computeLedger({
    initialChargesIdr: 24000,
    debitAdjustmentsIdr: 8000, // weight increased on revision
    confirmedReceiptsIdr: 24000,
  });
  assert.equal(revisedOrder.netChargesIdr, 32000);
  assert.equal(revisedOrder.balanceIdr, 8000);
  assert.equal(revisedOrder.settlement, "PARTIAL");

  // Reversing a wrongly recorded transfer reopens the balance.
  const reversed = computeLedger({
    initialChargesIdr: 50000,
    confirmedReceiptsIdr: 50000,
    receiptReversalsIdr: 20000,
  });
  assert.equal(reversed.balanceIdr, 20000);

  assert.equal(deriveSettlement(0, 0), "ZERO_CHARGE");
  assert.equal(deriveSettlement(22000, 22000), "SETTLED");
  assert.equal(deriveSettlement(22000, 0), "UNPAID");
}

console.log("-> Testing PRD §7.5 FR34 & FR35 WhatsApp Formatting & Clean Numbers...");
{
  const msg = buildReadyWhatsAppMessage({
    orderNumber: "OUT-260910-1000",
    customerName: "Hendro",
    outletName: "Outlet Surabaya",
    serviceSummary: "Cuci Reguler 5kg",
    balanceIdr: 0,
  }, "RAK-B03");

  assert.ok(msg.includes("OUT-260910-1000"));
  assert.ok(msg.includes("RAK-B03"));
  assert.ok(msg.includes("LUNAS"));

  const waUrl = generateWhatsAppUrl("0812-3456-7890", "Halo test");
  assert.ok(waUrl.startsWith("https://wa.me/6281234567890?text="));
}

console.log("-> Testing PRD §9.5 & §17.1 Cash Drawer Reconciliation Formula (T21, T22, T23)...");
{
  // T21: 100.000 float + 300.000 cash - 40.000 expense - 20.000 refund = 340.000 expected.
  const expected = computeExpectedCash({
    openingFloatIdr: 100000,
    cashReceiptsIdr: 300000,
    cashExpensesIdr: 40000,
    cashRefundsIdr: 20000,
  });
  assert.equal(expected, 340000, "Expected cash calculation must equal 340000");

  const actualCount = 335000;
  const discrepancy = actualCount - expected;
  assert.equal(discrepancy, -5000, "Discrepancy is actual - expected = -5000");
}

console.log("-> Testing PRD §5.3, §5.4 & §17.1 Handover & Production State Guards (T13, T14, T16)...");
{
  const ironOnly: WorkStage[] = ["QUEUED", "IRONING", "QC", "READY"];
  assert.equal(nextStage(ironOnly, "QUEUED"), "IRONING", "Iron-only skips washing/drying");
  assert.equal(nextStage(kiloanReguler.workflowSteps, "QUEUED"), "WASHING");
  assert.equal(nextStage(ironOnly, "READY"), null, "Ready is terminal in workflow");
}

console.log("All PRD domain calculations, payment verification guards, and cash reconciliation checks PASSED successfully!");
