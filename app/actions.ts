"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { cycleMode, getCycle, getOrder } from "@/lib/data";
import { createOrder, parseOrderForm } from "@/lib/orders";
import { fill, getLang, strings } from "@/lib/i18n";
import { DbUnavailableError } from "@/lib/db-error";
import { fail, OK, type ActionResult } from "@/lib/result";

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
  const ref = String(fd.get("ref") ?? "").trim().slice(0, 40);
  if (!ref) return fail(t.errToast);
  const { error } = await db()
    .from("orders")
    .update({ payment_ref: ref, payment_status: "reported" })
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
