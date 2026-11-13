import { createHash } from "crypto";
import { db } from "./supabase";
import { cycleMode, getMenu, getOrder, must } from "./data";
import { cleanLines, priceStanding, type StandingLine } from "./standing";
import type { Cycle } from "./types";

export type Standing = {
  id: string;
  token: string;
  active: boolean;
  customer_id: string;
  office_id: string | null;
  delivery_note: string | null;
  payment_method: "lipa" | "cash";
  lines: StandingLine[];
  created_at: string;
  customers: { name: string; phone: string } | null;
  offices: { name: string } | null;
};

const SELECT = "id,token,active,customer_id,office_id,delivery_note,payment_method,lines,created_at,customers(name,phone),offices(name)";

/** Deterministic idempotency key for (standing order, cycle): materialising twice can never create two orders. */
export function standingKey(standingId: string, cycleId: string): string {
  const h = createHash("sha256").update(`standing:${standingId}:${cycleId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const norm = (r: unknown): Standing => {
  const s = r as Standing;
  return { ...s, lines: cleanLines(s.lines) };
};

export async function getStandingByToken(token: string): Promise<Standing | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const data = must(await db().from("standing_orders").select(SELECT).eq("token", token).maybeSingle(), "standingByToken");
  return data ? norm(data) : null;
}

/** The customer's latest standing order (active or paused), for the card on their order page. */
export async function getStandingForCustomer(customerId: string): Promise<{ token: string; active: boolean } | null> {
  const data = must(
    await db().from("standing_orders").select("token,active").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    "standingForCustomer",
  );
  return (data as { token: string; active: boolean } | null) ?? null;
}

export async function listStanding(): Promise<Standing[]> {
  const data = must(await db().from("standing_orders").select(SELECT).order("created_at", { ascending: false }).limit(500), "listStanding");
  return ((data as unknown[] | null) ?? []).map(norm);
}

/**
 * Turn an existing OFFICE order into the customer's standing order (replacing their current one).
 * The order link is the credential (same as paying / cancelling); only the order's own lines, office, note and
 * payment method are copied. Home deliveries are not supported (they would need the location every week).
 */
export async function createStandingFromOrder(orderId: string): Promise<{ ok: true; token: string } | { ok: false; reason: "notFound" | "home" | "status" | "empty" }> {
  const o = await getOrder(orderId);
  if (!o || !o.customers) return { ok: false, reason: "notFound" };
  if (o.delivery_type === "home") return { ok: false, reason: "home" };
  if (o.status !== "confirmed" && o.status !== "delivered") return { ok: false, reason: "status" };
  const lines = cleanLines(o.order_lines.map((l) => ({ item_id: l.item_id, qty: l.qty })));
  if (lines.length === 0) return { ok: false, reason: "empty" };

  const row = {
    customer_id: o.customers.id,
    active: true,
    office_id: o.offices?.id ?? null,
    delivery_note: o.delivery_note,
    payment_method: o.payment_method,
    lines,
    updated_at: new Date().toISOString(),
  };
  const sb = db();
  const existing = must(await sb.from("standing_orders").select("id,token").eq("customer_id", o.customers.id).eq("active", true).maybeSingle(), "existingStanding") as { id: string; token: string } | null;
  if (existing) {
    const { error } = await sb.from("standing_orders").update(row).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { ok: true, token: existing.token };
  }
  // a paused one for this customer may exist: reuse its token so the old link keeps working
  const paused = must(await sb.from("standing_orders").select("id,token").eq("customer_id", o.customers.id).order("created_at", { ascending: false }).limit(1).maybeSingle(), "pausedStanding") as { id: string; token: string } | null;
  if (paused) {
    const { error } = await sb.from("standing_orders").update(row).eq("id", paused.id);
    if (error) throw new Error(error.message);
    return { ok: true, token: paused.token };
  }
  const ins = await sb.from("standing_orders").insert(row).select("token").single();
  if (ins.error || !ins.data) throw new Error(ins.error?.message ?? "insert failed");
  return { ok: true, token: ins.data.token as string };
}

export async function setStandingActive(token: string, active: boolean): Promise<boolean> {
  const { data, error } = await db().from("standing_orders").update({ active, updated_at: new Date().toISOString() }).eq("token", token).select("id");
  if (error) {
    // unique "one active per customer": resuming while another active one exists
    if (error.code === "23505") return false;
    throw new Error(error.message);
  }
  return (data?.length ?? 0) > 0;
}

export type MaterializeSummary = { ok: boolean; reason?: string; created: number; existing: number; full: number; skipped: number; failed: number };

type OneResult = "created" | "existing" | "full" | "failed";

async function materializeOne(cycle: Cycle, s: Standing, menu: { id: string; price: number; active: boolean }[]): Promise<OneResult> {
  const priced = priceStanding(s.lines, menu);
  if (priced.lines.length === 0 || !s.customers) return "failed"; // every item was removed from the menu
  const { data, error } = await db().rpc("create_order_atomic", {
    p_cycle: cycle.id,
    p_mode: "open",
    p_customer: { phone: s.customers.phone, name: s.customers.name, office_id: s.office_id, sms_opt_in: false },
    p_order: {
      office_id: s.office_id,
      delivery_type: "office",
      delivery_note: s.delivery_note,
      status: "confirmed",
      payment_method: s.payment_method,
      total: priced.total,
      idempotency_key: standingKey(s.id, cycle.id),
      standing_id: s.id,
    },
    p_lines: priced.lines,
  });
  if (error) return "failed";
  const r = data as { ok?: boolean; existing?: boolean; code?: string } | null;
  if (r?.ok) return r.existing ? "existing" : "created";
  return r?.code === "errCapacity" ? "full" : "failed";
}

/**
 * Create this cycle's orders from active standing orders (skipped weeks excluded). Idempotent: a deterministic key per
 * (standing, cycle) means re-running never duplicates. Capacity is enforced like any order (those that don't fit are
 * counted as "full"). Only works while the cycle is open for orders.
 */
export async function materializeStanding(cycle: Cycle, only?: string): Promise<MaterializeSummary> {
  const zero = { created: 0, existing: 0, full: 0, skipped: 0, failed: 0 };
  if (cycleMode(cycle) !== "open") return { ok: false, reason: "Oda hazipokelewi sasa.", ...zero };
  const sb = db();
  const [all, skips, menu] = await Promise.all([
    sb.from("standing_orders").select(SELECT).eq("active", true).limit(500),
    sb.from("standing_skips").select("standing_id").eq("cycle_id", cycle.id),
    getMenu(true),
  ]);
  const skipped = new Set(((must(skips, "skips") as { standing_id: string }[] | null) ?? []).map((r) => r.standing_id));
  const list = (((must(all, "standingAll") as unknown[] | null) ?? []).map(norm)).filter((s) => !only || s.id === only);

  const out = { ...zero };
  for (const s of list) {
    if (skipped.has(s.id)) {
      out.skipped++;
      continue;
    }
    out[await materializeOne(cycle, s, menu)]++;
  }
  return { ok: true, ...out };
}

export type WeekState =
  | { state: "closed" }
  | { state: "skipped" }
  | { state: "ordered"; orderId: string; total: number; paid: boolean }
  | { state: "missing" };

/** What is happening with this standing order in the current cycle. */
export async function weekState(s: Standing, cycle: Cycle | null): Promise<WeekState> {
  if (!cycle || cycleMode(cycle) !== "open") return { state: "closed" };
  const sb = db();
  const skip = must(await sb.from("standing_skips").select("standing_id").eq("standing_id", s.id).eq("cycle_id", cycle.id).maybeSingle(), "skip");
  if (skip) return { state: "skipped" };
  const o = must(
    await sb.from("orders").select("id,total,payment_status,status").eq("standing_id", s.id).eq("cycle_id", cycle.id).in("status", ["confirmed", "delivered"]).maybeSingle(),
    "standingOrder",
  ) as { id: string; total: number; payment_status: string } | null;
  return o ? { state: "ordered", orderId: o.id, total: o.total, paid: o.payment_status === "paid" } : { state: "missing" };
}

/** "Skip this week": remember the skip and delete this week's auto-created order (only while unpaid and before the cutoff). */
export async function skipWeek(s: Standing, cycle: Cycle): Promise<"ok" | "closed" | "paid"> {
  if (cycleMode(cycle) !== "open") return "closed";
  const sb = db();
  const o = must(
    await sb.from("orders").select("id,payment_status,status").eq("standing_id", s.id).eq("cycle_id", cycle.id).maybeSingle(),
    "standingOrder",
  ) as { id: string; payment_status: string; status: string } | null;
  if (o && o.payment_status !== "unpaid") return "paid"; // money is involved: the cook handles it
  if (o && o.status === "delivered") return "closed";
  const ins = await sb.from("standing_skips").insert({ standing_id: s.id, cycle_id: cycle.id });
  if (ins.error && ins.error.code !== "23505") throw new Error(ins.error.message);
  if (o) await sb.from("orders").delete().eq("id", o.id).eq("payment_status", "unpaid");
  return "ok";
}

/** Undo a skip: forget it and create this week's order again (capacity permitting). */
export async function unskipWeek(s: Standing, cycle: Cycle): Promise<"created" | "full" | "closed" | "failed"> {
  if (cycleMode(cycle) !== "open") return "closed";
  await db().from("standing_skips").delete().eq("standing_id", s.id).eq("cycle_id", cycle.id);
  const r = await materializeStanding(cycle, s.id);
  if (r.created > 0) return "created";
  if (r.full > 0) return "full";
  return "failed"; // includes "an order already exists but was cancelled by the cook": that is her decision, not ours
}
