import { randomBytes } from "crypto";
import { db } from "./supabase";
import { must } from "./data";
import { amountMatches, becameSuccess, nextStatus, shouldMarkOrderPaid, type PaymentStatus } from "./payments";
import type { ParsedCallback } from "./azampay-callback";

/** How long a USSD attempt is treated as "waiting for the customer's PIN" before we show the manual fallback. */
export const PENDING_WINDOW_MS = 180_000;
export const MAX_ATTEMPTS_PER_HOUR = 3;

export type PaymentRow = {
  id: string;
  order_id: string;
  provider: string;
  external_id: string;
  network: string | null;
  phone: string;
  amount: number;
  status: PaymentStatus;
  provider_ref: string | null;
  failure_reason: string | null;
  created_at: string;
};

/** Unique, ASCII, <= 128 chars: "fc" + order id without dashes + random suffix. */
export const newExternalId = (orderId: string) => `fc${orderId.replace(/-/g, "")}-${randomBytes(4).toString("hex")}`;

export async function getOrderPayments(orderId: string): Promise<PaymentRow[]> {
  const data = must(
    await db().from("payments").select("*").eq("order_id", orderId).order("created_at", { ascending: false }).limit(10),
    "getOrderPayments",
  );
  return (data as PaymentRow[] | null) ?? [];
}

/** Attempts still waiting for the customer: pending and younger than the window. */
export const activePending = (rows: PaymentRow[], now = Date.now()) =>
  rows.find((p) => p.status === "pending" && now - new Date(p.created_at).getTime() < PENDING_WINDOW_MS) ?? null;

/** Milliseconds since the attempt was created. */
export const ageMs = (row: Pick<PaymentRow, "created_at">, now = Date.now()) => now - new Date(row.created_at).getTime();

/** Mark attempts that waited longer than the window as expired (a late success callback can still upgrade them). */
export async function expireStale(orderId: string): Promise<void> {
  await db()
    .from("payments")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - PENDING_WINDOW_MS).toISOString());
}

export type CallbackOutcome = "no-match" | "ignored" | "amount-mismatch" | "duplicate" | "applied";

/**
 * Apply an authenticated callback. Safe to call repeatedly / out of order:
 *  - the payment is found by OUR external id only; unknown ids change nothing;
 *  - success needs the exact order amount; unclear statuses change nothing;
 *  - the status change is a conditional update (compare-and-set), so concurrent duplicates credit once;
 *  - the order is marked paid only when this callback newly made the payment successful.
 * The raw body is always kept in payment_callbacks. Throws on database errors (the route then answers 500).
 */
export async function applyCallback(parsed: ParsedCallback | null, raw: unknown): Promise<CallbackOutcome> {
  const sb = db();
  const log = async (outcome: CallbackOutcome, ext: string | null) => {
    await sb.from("payment_callbacks").insert({ external_id: ext, outcome, body: raw as object });
    return outcome;
  };
  if (!parsed) return log("no-match", null);

  const pay = must(await sb.from("payments").select("*").eq("external_id", parsed.externalId).maybeSingle(), "payment lookup") as PaymentRow | null;
  if (!pay) return log("no-match", parsed.externalId);
  if (parsed.status === "unknown") return log("ignored", parsed.externalId);
  if (parsed.status === "success" && !amountMatches(pay.amount, parsed.amount)) return log("amount-mismatch", parsed.externalId);

  const next = nextStatus(pay.status, parsed.status);
  if (next === pay.status) return log("duplicate", parsed.externalId);

  const { data: changed, error } = await sb
    .from("payments")
    .update({
      status: next,
      provider_ref: parsed.providerRef ?? pay.provider_ref,
      failure_reason: next === "failed" ? parsed.message ?? "failed" : null,
      raw: raw as object,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pay.id)
    .eq("status", pay.status) // compare-and-set: only if nobody changed it meanwhile
    .select("id");
  if (error) throw new Error(`payment update failed: ${error.message}`);
  if (!changed || changed.length === 0) return log("duplicate", parsed.externalId);

  if (becameSuccess(pay.status, next)) {
    const order = must(await sb.from("orders").select("payment_status").eq("id", pay.order_id).maybeSingle(), "order lookup") as { payment_status: string } | null;
    if (order && shouldMarkOrderPaid(order.payment_status)) {
      const { error: oe } = await sb
        .from("orders")
        .update({ payment_status: "paid", paid_at: new Date().toISOString(), payment_ref: `AzamPay ${parsed.providerRef ?? pay.external_id}` })
        .eq("id", pay.order_id)
        .neq("payment_status", "paid");
      if (oe) throw new Error(`order update failed: ${oe.message}`);
    }
  }
  return log("applied", parsed.externalId);
}
