import type { CalculatedOrderLine, OrderLineInput, OrderQuote, ServiceVersion } from "@/types";

/**
 * Calculates billable weight in grams based on minimum and increment rules.
 * Formula from PRD §9.1: ceil(max(actual_grams, min_grams) / increment_grams) * increment_grams
 */
export function calculateBillableGrams(
  actualGrams: number,
  minGrams: number = 0,
  incrementGrams: number = 100
): number {
  if (actualGrams <= 0) return 0;
  const effectiveBase = Math.max(actualGrams, minGrams);
  const inc = Math.max(1, incrementGrams);
  return Math.ceil(effectiveBase / inc) * inc;
}

/**
 * Calculates line gross price in integer IDR with round-half-up.
 */
export function calculateLineGross(
  unit: "kg" | "piece",
  actualQuantity: number,
  service: ServiceVersion
): { billableQuantity: number; subtotalIdr: number } {
  if (unit === "kg") {
    const billableGrams = calculateBillableGrams(
      actualQuantity,
      service.minGrams,
      service.incrementGrams
    );
    // Integer round-half-up: (billableGrams * rate + 500) / 1000
    const rawPrice = (billableGrams * service.pricePerUnitIdr) / 1000;
    const subtotalIdr = Math.round(rawPrice);
    return { billableQuantity: billableGrams, subtotalIdr };
  } else {
    const qty = Math.max(0, Math.floor(actualQuantity));
    const subtotalIdr = qty * service.pricePerUnitIdr;
    return { billableQuantity: qty, subtotalIdr };
  }
}

/**
 * Calculates complete order quote from input lines and fixed discount.
 */
export function calculateOrderQuote(
  lines: OrderLineInput[],
  discountIdr: number = 0,
  baseTime: Date = new Date()
): OrderQuote {
  let subtotalIdr = 0;
  let maxSlaHours = 24;

  const calculatedLines: CalculatedOrderLine[] = lines.map((item) => {
    const { billableQuantity, subtotalIdr: lineSubtotal } = calculateLineGross(
      item.serviceVersion.unit,
      item.actualQuantity,
      item.serviceVersion
    );

    subtotalIdr += lineSubtotal;
    if (item.serviceVersion.slaHours > maxSlaHours) {
      maxSlaHours = item.serviceVersion.slaHours;
    }

    const dueAt = new Date(baseTime.getTime() + item.serviceVersion.slaHours * 3600 * 1000).toISOString();

    return {
      serviceVersionId: item.serviceVersion.id,
      serviceName: item.serviceVersion.name,
      unit: item.serviceVersion.unit,
      actualQuantity: item.actualQuantity,
      billableQuantity,
      ratePerUnitIdr: item.serviceVersion.pricePerUnitIdr,
      subtotalIdr: lineSubtotal,
      dueAt,
    };
  });

  const validDiscount = Math.min(Math.max(0, discountIdr), subtotalIdr);
  const totalChargesIdr = subtotalIdr - validDiscount;
  const suggestedDueAt = new Date(baseTime.getTime() + maxSlaHours * 3600 * 1000).toISOString();

  return {
    lines: calculatedLines,
    subtotalIdr,
    discountIdr: validDiscount,
    totalChargesIdr,
    suggestedDueAt,
  };
}
