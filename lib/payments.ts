// Payment rules that make callbacks safe to receive twice, late, or out of order. Pure, no imports.

export type PaymentStatus = "pending" | "success" | "failed" | "expired";

/**
 * The status a payment ends up in when a gateway reports `incoming`.
 * - success is final (a repeated or contradictory callback can never undo it, so it can't double-credit);
 * - failed is final;
 * - expired may still turn into success (the customer entered their PIN after our timeout: money really moved).
 */
export function nextStatus(current: PaymentStatus, incoming: PaymentStatus): PaymentStatus {
  if (current === "success" || current === "failed") return current;
  if (current === "expired") return incoming === "success" ? "success" : "expired";
  return incoming; // pending → anything
}

/** True when this callback is the one that newly makes the payment successful (i.e. the order should now be marked paid). */
export const becameSuccess = (before: PaymentStatus, after: PaymentStatus) => before !== "success" && after === "success";

/** Amounts arrive as numbers or strings ("8000", "8000.00"). Must equal the order total exactly (TZS integers). */
export function amountMatches(expected: number, got: number | string | null | undefined): boolean {
  if (got === null || got === undefined || got === "") return false;
  const n = typeof got === "number" ? got : Number(String(got).replace(/,/g, ""));
  return Number.isFinite(n) && Math.round(n) === n && n === expected;
}

/** Orders already paid (or paid by hand by the cook) must not be touched again. */
export const shouldMarkOrderPaid = (orderPaymentStatus: string) => orderPaymentStatus !== "paid";
