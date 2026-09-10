import { OrderLineInput } from "@/types";

/* =============================================================================
   PRD §7.2 / FR08 — Draft order preservation.
   Local form state is retained temporarily for shift recovery without 
   creating unofficial database orders or leaking PII across sessions.
   ============================================================================= */

export interface OrderDraft {
  outletId: string;
  customerName: string;
  customerPhone?: string;
  items: Array<{ serviceId: string; quantityInput: string; notes: string }>;
  discountInput: string;
  depositInput: string;
  paymentMethod: string;
  savedAt: number;
}

const DRAFT_STORAGE_PREFIX = "lf_draft_order_";
const DRAFT_TTL_MS = 12 * 3600 * 1000; // 12 hours (1 shift)

export function saveOrderDraft(outletId: string, draft: Omit<OrderDraft, "outletId" | "savedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const key = `${DRAFT_STORAGE_PREFIX}${outletId}`;
    const payload: OrderDraft = {
      ...draft,
      outletId,
      savedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

export function loadOrderDraft(outletId: string): OrderDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const key = `${DRAFT_STORAGE_PREFIX}${outletId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: OrderDraft = JSON.parse(raw);
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      clearOrderDraft(outletId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearOrderDraft(outletId: string): void {
  if (typeof window === "undefined") return;
  try {
    const key = `${DRAFT_STORAGE_PREFIX}${outletId}`;
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
