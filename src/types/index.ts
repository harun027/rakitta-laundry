export type Role = "owner" | "supervisor" | "cashier" | "operator" | "saas_admin";

export type OrderLifecycle = "DRAFT" | "ACTIVE" | "CANCELLED";

export type WorkStage = "QUEUED" | "WASHING" | "DRYING" | "IRONING" | "FOLDING" | "QC" | "READY" | "CANCELLED";

export type CustodyState = "IN_CUSTODY" | "HANDED_OVER" | "RETURNED_ON_CANCEL";

export type SettlementStatus = "UNPAID" | "PARTIAL" | "SETTLED" | "CREDIT_DUE" | "ZERO_CHARGE";

export type PaymentMethod = "CASH" | "TRANSFER" | "QRIS";

export type PaymentAttemptStatus = "PENDING_VERIFICATION" | "CONFIRMED" | "REJECTED";

export type ServiceUnit = "kg" | "piece";

export interface ServiceVersion {
  id: string;
  serviceId: string;
  name: string;
  unit: ServiceUnit;
  pricePerUnitIdr: number; // Integer Rupiah
  minGrams: number;        // e.g. 3000
  incrementGrams: number;  // e.g. 100
  slaHours: number;        // e.g. 48
  workflowSteps: WorkStage[];
  isActive: boolean;
}

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  normalizedPhone?: string | null;
  notes?: string;
  createdAt: string;
}

export interface OrderLineInput {
  serviceVersion: ServiceVersion;
  actualQuantity: number; // grams if kg, count if piece
  notes?: string;
}

export interface CalculatedOrderLine {
  serviceVersionId: string;
  serviceName: string;
  unit: ServiceUnit;
  actualQuantity: number;
  billableQuantity: number;
  ratePerUnitIdr: number;
  subtotalIdr: number;
  dueAt: string;
}

export interface OrderQuote {
  lines: CalculatedOrderLine[];
  subtotalIdr: number;
  discountIdr: number;
  totalChargesIdr: number; // C
  suggestedDueAt: string;
}

export interface Order {
  id: string;
  tenantId: string;
  outletId: string;
  customerId: string;
  orderNumber: string; // OUT-YYMMDD-XXXX
  lifecycle: OrderLifecycle;
  version: number;
  totalChargesIdr: number; // Net charges C
  paidAmountIdr: number;   // Net confirmed receipts N
  balanceIdr: number;      // C - N
  settlementStatus: SettlementStatus;
  custodyState: CustodyState;
  acceptedAt: string;
  originalPromisedAt: string;
  currentPromisedAt: string;
  customer?: Customer;
  lines?: CalculatedOrderLine[];
  workItems?: WorkItem[];
  packages?: FinalPackage[];
}

export interface WorkItem {
  id: string;
  orderId: string;
  lineId: string;
  stage: WorkStage;
  version: number;
  workflowSnapshot: WorkStage[];
  cycle: number;
  bagCodes: string[];
  dueAt: string;
}

export interface FinalPackage {
  id: string;
  orderId: string;
  packageCode: string;
  rackCode: string;
  custodyState: CustodyState;
  createdAt: string;
}

export interface Receipt {
  id: string;
  orderId: string;
  amountIdr: number;
  method: PaymentMethod;
  confirmedAt: string;
  verifierId: string;
  reference?: string;
}

export interface CashSession {
  id: string;
  outletId: string;
  openedBy: string;
  openedAt: string;
  closedAt?: string;
  openingFloatIdr: number;
  expectedCashIdr: number;
  actualCashIdr?: number;
  discrepancyIdr?: number;
  status: "OPEN" | "CLOSED";
  notes?: string;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  field_errors?: Record<string, string>;
  request_id: string;
}

