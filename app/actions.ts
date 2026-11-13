"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { createStandingFromOrder, getStandingByToken, setStandingActive, skipWeek, unskipWeek } from "@/lib/standing-db";
import { cycleMode, getCurrentCycle, getCycle, getOrder } from "@/lib/data";
import { createOrder, parseOrderForm } from "@/lib/orders";
import { fill, getLang, strings } from "@/lib/i18n";
import { DbUnavailableError } from "@/lib/db-error";
import { fail, OK, type ActionResult } from "@/lib/result";
import { azampayCheckout, payByPhoneEnabled } from "@/lib/azampay";
import { activePending, expireStale, getOrderPayments, MAX_ATTEMPTS_PER_HOUR, newExternalId } from "@/lib/payments-db";
import { normalizePhone } from "@/lib/phone";
import { refCandidates } from "@/lib/sms-match";
import type { Network } from "@/lib/mobile-network";

/**
 * retry: the failure was a network problem, so the form may resubmit automatically (same idempotency key).
 * redirectTo: success — the client navigates there (so it can show a toast first).
 */
export type FormState = { error?: string; retry?: boolean; redirectTo?: string };

export async function placeOrder(_: FormState, fd: FormData): Promise<FormState> {
  const lang = getLang(String(fd.get("lang") ?? "sw"));
  const t = strings(lang);

  const parsed = parseOrderForm(fd);
  if (!parsed.ok) return { error: t[parsed.code] };

  let res;
  try {
    const cycle = await getCycle(String(fd.get("cycle_id") ?? ""));
    const mode = cycleMode(cycle);
    if (!cycle || (mode !== "open" && mode !== "late")) return { error: t.manuallyClosed };
    res = await createOrder(cycle, parsed.value, mode);
  } catch (e) {
    if (e instanceof DbUnavailableError) return { error: t.errNetwork, retry: true };
    throw e;
  }
  if (!res.ok) return { error: fill(t[res.code], { n: res.n ?? 0 }), retry: res.code === "errNetwork" };

  return { redirectTo: `/order/${res.id}?lang=${lang}` };
}

export async function reportPayment(fd: FormData): Promise<ActionResult> {
  const id = String(fd.get("order_id") ?? "");
  const t = strings(getLang(String(fd.get("lang") ?? "sw")));
  // One box: either just the transaction ID, or the whole confirmation message pasted from the SMS.
  const raw = String(fd.get("ref") ?? "").trim().slice(0, 800);
  if (!raw) return fail(t.errToast);
  let ref: string;
  let msg: string | null = null;
  if (/\s/.test(raw)) {
    const found = refCandidates(raw);
    if (found.length === 0) return fail(t.payRefNotFound);
    ref = found[0]; // best guess; the whole message is kept too, and the cook's SMS check tries every ID-like token in it
    msg = raw;
  } else {
    ref = raw.slice(0, 40);
  }
  const { error } = await db()
    .from("orders")
    .update({ payment_ref: ref, payment_msg: msg, payment_status: "reported" })
    .eq("id", id)
    .eq("payment_status", "unpaid");
  if (error) return fail(t.errToast);
  revalidatePath(`/order/${id}`);
  return OK;
}

export async function cancelOrder(fd: FormData): Promise<ActionResult> {
  const id = String(fd.get("order_id") ?? "");
  const t = strings(getLang(String(fd.get("lang") ?? "sw")));
  try {
    const order = await getOrder(id);
    if (order && (order.status === "confirmed" || order.status === "late_request") && order.payment_status !== "paid") {
      const cycle = await getCycle(order.cycle_id);
      // Customers can self-cancel only before the cutoff; after that it needs the cook.
      if (cycle && new Date() < new Date(cycle.closes_at)) {
        const { error } = await db().from("orders").update({ status: "cancelled" }).eq("id", id);
        if (error) return fail(t.errToast);
      }
    }
  } catch {
    return fail(t.errToast);
  }
  revalidatePath(`/order/${id}`);
  return OK;
}

export async function submitReview(fd: FormData): Promise<ActionResult> {
  const token = String(fd.get("token") ?? "");
  const t = strings(getLang(String(fd.get("lang") ?? "sw")));
  const rating = Math.floor(Number(fd.get("rating")));
  const comment = String(fd.get("comment") ?? "").trim().slice(0, 500) || null;
  if (!(rating >= 1 && rating <= 5)) return fail(t.errToast);
  const { data: order, error: oe } = await db()
    .from("orders")
    .select("id,status")
    .eq("review_token", token)
    .maybeSingle();
  if (oe) return fail(t.errToast);
  if (order && order.status === "delivered") {
    const { error } = await db()
      .from("reviews")
      .upsert({ order_id: order.id, rating, comment }, { onConflict: "order_id" });
    if (error) return fail(t.errToast);
  }
  revalidatePath(`/r/${token}`);
  return OK;
}

export type OrderBrief = { id: string; status: string; payment_status: string; payment_method: string; total: number };

/**
 * Status of the orders THIS device placed (it sends the order ids it remembers). The ids are the capability: nobody can
 * ask by phone number, and only status/payment/total come back (no name, address or location).
 */
export async function myOrders(ids: string[]): Promise<OrderBrief[]> {
  const clean = (Array.isArray(ids) ? ids : []).map(String).filter((i) => /^[0-9a-f-]{36}$/i.test(i)).slice(0, 5);
  if (clean.length === 0) return [];
  try {
    const { data, error } = await db().from("orders").select("id,status,payment_status,payment_method,total").in("id", clean);
    return error ? [] : ((data ?? []) as OrderBrief[]);
  } catch {
    return [];
  }
}

/* ---------- standing ("every week") orders ---------- */

/** Make this (office) order the customer's weekly order. The order link is the credential, like paying/cancelling. */
export async function makeStandingOrder(fd: FormData): Promise<ActionResult> {
  const id = String(fd.get("order_id") ?? "");
  const t = strings(getLang(String(fd.get("lang") ?? "sw")));
  try {
    const r = await createStandingFromOrder(id);
    if (!r.ok) return fail(r.reason === "home" ? t.standingHome : t.errToast);
    revalidatePath(`/order/${id}`);
    return OK;
  } catch {
    return fail(t.errToast);
  }
}

async function standingContext(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const t = strings(getLang(String(fd.get("lang") ?? "sw")));
  const s = await getStandingByToken(token);
  const cycle = await getCurrentCycle();
  return { token, t, s, cycle };
}

export async function standingSkip(fd: FormData): Promise<ActionResult> {
  try {
    const { token, t, s, cycle } = await standingContext(fd);
    if (!s || !cycle) return fail(t.errToast);
    const r = await skipWeek(s, cycle);
    if (r === "paid") return fail(t.stPaidCant);
    if (r === "closed") return fail(t.stClosed);
    revalidatePath(`/s/${token}`);
    return OK;
  } catch {
    return fail(strings("sw").errToast);
  }
}

export async function standingUnskip(fd: FormData): Promise<ActionResult> {
  try {
    const { token, t, s, cycle } = await standingContext(fd);
    if (!s || !cycle) return fail(t.errToast);
    const r = await unskipWeek(s, cycle);
    revalidatePath(`/s/${token}`);
    if (r === "full") return fail(t.stFull);
    if (r === "closed") return fail(t.stClosed);
    if (r === "failed") return fail(t.errToast);
    return OK;
  } catch {
    return fail(strings("sw").errToast);
  }
}

export async function standingSetActive(fd: FormData): Promise<ActionResult> {
  try {
    const { token, t, s } = await standingContext(fd);
    if (!s) return fail(t.errToast);
    const ok = await setStandingActive(token, String(fd.get("active")) === "1");
    revalidatePath(`/s/${token}`);
    return ok ? OK : fail(t.errToast);
  } catch {
    return fail(strings("sw").errToast);
  }
}

/** Unsubscribe link in every SMS: the token (unguessable) is the only credential. Idempotent. */
export async function unsubscribeSms(fd: FormData): Promise<ActionResult> {
  const token = String(fd.get("token") ?? "");
  const t = strings(getLang(String(fd.get("lang") ?? "sw")));
  if (!/^[0-9a-f-]{36}$/i.test(token)) return fail(t.errToast);
  const { error } = await db().from("customers").update({ sms_opt_in: false }).eq("unsub_token", token);
  if (error) return fail(t.errToast);
  revalidatePath(`/u/${token}`);
  return OK;
}

const NETWORKS: Network[] = ["Mpesa", "Tigo", "Airtel", "Halopesa"];

/**
 * Send a USSD push (AzamPay) for an order. The order is marked paid ONLY by the callback (never here).
 * Safeguards: one waiting attempt per order (unique index + check), max 3 attempts/hour, amount always the
 * server-side order total, nothing sent for paid/cancelled orders. A timeout from AzamPay is "unknown", not failure.
 */
export async function startPayment(fd: FormData): Promise<ActionResult> {
  const id = String(fd.get("order_id") ?? "");
  const t = strings(getLang(String(fd.get("lang") ?? "sw")));
  if (!payByPhoneEnabled()) return fail(t.payUnavailable);

  const phone = normalizePhone(String(fd.get("pay_phone") ?? ""));
  if (!phone) return fail(t.errPhone);
  const network = NETWORKS.find((n) => n === String(fd.get("network") ?? ""));
  if (!network) return fail(t.payNetworkNeeded);

  try {
    const order = await getOrder(id);
    if (!order || order.payment_method !== "lipa" || order.payment_status === "paid" || !(order.status === "confirmed" || order.status === "delivered")) {
      return fail(t.errToast);
    }
    await expireStale(id);
    const rows = await getOrderPayments(id);
    if (activePending(rows)) return fail(t.payPending);
    if (rows.filter((p) => Date.now() - new Date(p.created_at).getTime() < 3_600_000).length >= MAX_ATTEMPTS_PER_HOUR) return fail(t.payTooMany);

    const externalId = newExternalId(id);
    const ins = await db()
      .from("payments")
      .insert({ order_id: id, provider: "azampay", external_id: externalId, network, phone, amount: order.total })
      .select("id")
      .single();
    if (ins.error?.code === "23505") return fail(t.payPending); // unique index: another attempt is already waiting
    if (ins.error || !ins.data) return fail(t.errToast);

    const res = await azampayCheckout({ phone, amount: order.total, externalId, network });
    if (res.kind === "rejected") {
      await db()
        .from("payments")
        .update({ status: "failed", failure_reason: res.message.slice(0, 300), updated_at: new Date().toISOString() })
        .eq("id", ins.data.id)
        .eq("status", "pending");
      revalidatePath(`/order/${id}`);
      return fail(t.payRefused);
    }
    if (res.kind === "accepted") {
      await db().from("payments").update({ provider_ref: res.transactionId, updated_at: new Date().toISOString() }).eq("id", ins.data.id);
    }
    // "unknown" (timeout): the prompt may still arrive and the callback may still confirm, so leave it pending.
    revalidatePath(`/order/${id}`);
    return OK;
  } catch {
    return fail(t.errToast);
  }
}
