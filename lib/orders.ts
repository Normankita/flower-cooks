import { db } from "./supabase";
import { normalizePhone } from "./phone";
import { getMenu, homeStopsTaken, must, portionsTaken } from "./data";
import { DbUnavailableError, isNetworkMessage } from "./db-error";
import { haversineKm, parseHome, type HomeLocation } from "./geo";
import type { Cycle } from "./types";

export type OrderErrorCode =
  | "errName"
  | "errPhone"
  | "errItems"
  | "errTooMany"
  | "errCapacity"
  | "errLandmark"
  | "errLocation"
  | "errHomeOff"
  | "errHomeFull"
  | "errTooFar"
  | "errNetwork"
  | "errGeneric";

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; code: OrderErrorCode; n?: number };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PER_ITEM = 20;
const MAX_PER_ORDER = 30;

export type ParsedOrder = {
  name: string;
  phone: string;
  officeId: string | null;
  deliveryNote: string | null;
  notes: string | null;
  paymentMethod: "lipa" | "cash";
  lines: { itemId: string; qty: number }[];
  /** Client-generated UUID so a retried submit can never create a second order. */
  idemKey: string | null;
  /** Set when delivering to the customer's home (officeId is then null; deliveryNote is the landmark). */
  home: HomeLocation | null;
  /** ticked "send me reminders by SMS" (consent is only ever switched ON here; opting out is via the SMS link / admin) */
  smsOptIn: boolean;
};

export function parseOrderForm(
  fd: FormData,
): { ok: true; value: ParsedOrder } | { ok: false; code: OrderErrorCode } {
  const name = String(fd.get("name") ?? "").trim().slice(0, 80);
  if (name.length < 2) return { ok: false, code: "errName" };
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  if (!phone) return { ok: false, code: "errPhone" };

  const lines: { itemId: string; qty: number }[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("qty_")) continue;
    const qty = Math.floor(Number(v));
    if (qty > 0) lines.push({ itemId: k.slice(4), qty: Math.min(qty, MAX_PER_ITEM) });
  }
  if (lines.length === 0) return { ok: false, code: "errItems" };
  if (lines.reduce((s, l) => s + l.qty, 0) > MAX_PER_ORDER) return { ok: false, code: "errTooMany" };

  const office = String(fd.get("office_id") ?? "");
  const idem = String(fd.get("idem_key") ?? "");
  const clean = (k: string, max: number) => {
    const s = String(fd.get(k) ?? "").trim().slice(0, max);
    return s || null;
  };

  let home: HomeLocation | null = null;
  if (office === "home") {
    const h = parseHome({
      lat: String(fd.get("delivery_lat") ?? ""),
      lng: String(fd.get("delivery_lng") ?? ""),
      accuracy: String(fd.get("delivery_accuracy") ?? ""),
      link: String(fd.get("location_url") ?? ""),
      landmark: clean("delivery_note", 160),
    });
    if (!h.ok) return { ok: false, code: h.code };
    home = h.home;
  }

  return {
    ok: true,
    value: {
      name,
      phone,
      officeId: home ? null : office || null,
      home,
      smsOptIn: fd.get("sms_opt_in") === "on",
      deliveryNote: clean("delivery_note", 160),
      notes: clean("notes", 300),
      paymentMethod: fd.get("payment_method") === "cash" ? "cash" : "lipa",
      lines,
      idemKey: UUID_RE.test(idem) ? idem : null,
    },
  };
}

const failCode = (err: { message: string }): OrderErrorCode =>
  isNetworkMessage(err.message) ? "errNetwork" : "errGeneric";

/** An already-saved order for this idempotency key, if it is complete (has lines). A half-saved one is removed. */
async function existingOrder(key: string): Promise<string | null> {
  const sb = db();
  const row = must(
    await sb.from("orders").select("id, order_lines(id)").eq("idempotency_key", key).maybeSingle(),
    "existingOrder",
  ) as { id: string; order_lines: { id: string }[] } | null;
  if (!row) return null;
  if (row.order_lines.length > 0) return row.id;
  await sb.from("orders").delete().eq("id", row.id); // left over from a failed attempt
  return null;
}

/**
 * mode "open"  → regular order, capacity enforced, status confirmed
 * mode "late"  → after cutoff, becomes a late_request for admin approval
 * mode "admin" → entered by the cook (e.g. from WhatsApp), no checks, confirmed
 *
 * Returns errNetwork (never throws) when the database is unreachable; the form retries with the same
 * idempotency key, so a retry after a lost response returns the original order instead of a duplicate.
 */
export async function createOrder(
  cycle: Cycle,
  p: ParsedOrder,
  mode: "open" | "late" | "admin",
): Promise<CreateResult> {
  try {
    return await createOrderInner(cycle, p, mode);
  } catch (e) {
    if (e instanceof DbUnavailableError) return { ok: false, code: "errNetwork" };
    throw e;
  }
}

async function createOrderInner(
  cycle: Cycle,
  p: ParsedOrder,
  mode: "open" | "late" | "admin",
): Promise<CreateResult> {
  if (p.idemKey) {
    const done = await existingOrder(p.idemKey);
    if (done) return { ok: true, id: done };
  }

  const menu = await getMenu(true);
  const price = new Map(menu.map((m) => [m.id, m.price]));
  if (p.lines.some((l) => !price.has(l.itemId))) return { ok: false, code: "errItems" };

  // Home delivery rules (the cook can still enter anything herself in "admin" mode).
  if (p.home && mode !== "admin") {
    if (!cycle.home_enabled) return { ok: false, code: "errHomeOff" };
    if (cycle.home_max_stops != null && (await homeStopsTaken(cycle.id)) >= cycle.home_max_stops) {
      return { ok: false, code: "errHomeFull" };
    }
    // The distance limit can only be checked when we know both points; text-only locations are left to the cook.
    if (
      cycle.home_max_km != null &&
      cycle.kitchen_lat != null && cycle.kitchen_lng != null &&
      p.home.lat != null && p.home.lng != null &&
      haversineKm({ lat: cycle.kitchen_lat, lng: cycle.kitchen_lng }, { lat: p.home.lat, lng: p.home.lng }) > cycle.home_max_km
    ) {
      return { ok: false, code: "errTooFar", n: cycle.home_max_km };
    }
  }

  const qty = p.lines.reduce((s, l) => s + l.qty, 0);
  if (mode === "open") {
    const taken = await portionsTaken(cycle.id);
    const left = cycle.capacity - taken;
    if (qty > left) return { ok: false, code: "errCapacity", n: Math.max(left, 0) };
  }

  const sb = db();
  // Don't overwrite the customer's saved office when they order for home.
  const custRow: Record<string, unknown> = { phone: p.phone, name: p.name };
  if (p.officeId) custRow.office_id = p.officeId;
  if (p.smsOptIn) {
    custRow.sms_opt_in = true; // consent can only be switched ON by the customer here; an unticked box changes nothing
    custRow.sms_opt_in_at = new Date().toISOString();
  }
  const { data: cust, error: ce } = await sb
    .from("customers")
    .upsert(custRow, { onConflict: "phone" })
    .select("id")
    .single();
  if (ce || !cust) return { ok: false, code: ce ? failCode(ce) : "errGeneric" };

  const total = p.lines.reduce((s, l) => s + l.qty * (price.get(l.itemId) ?? 0), 0);
  const { data: order, error: oe } = await sb
    .from("orders")
    .insert({
      cycle_id: cycle.id,
      customer_id: cust.id,
      office_id: p.officeId,
      delivery_type: p.home ? "home" : "office",
      delivery_lat: p.home?.lat ?? null,
      delivery_lng: p.home?.lng ?? null,
      delivery_accuracy_m: p.home?.accuracyM ?? null,
      location_url: p.home?.url ?? null,
      delivery_note: p.deliveryNote,
      notes: p.notes,
      status: mode === "late" ? "late_request" : "confirmed",
      payment_method: p.paymentMethod,
      total,
      idempotency_key: p.idemKey,
    })
    .select("id")
    .single();
  if (oe || !order) {
    // Unique violation: a concurrent attempt with the same key already inserted it.
    if (oe?.code === "23505" && p.idemKey) {
      const done = await existingOrder(p.idemKey);
      if (done) return { ok: true, id: done };
    }
    return { ok: false, code: oe ? failCode(oe) : "errGeneric" };
  }

  const { error: le } = await sb.from("order_lines").insert(
    p.lines.map((l) => ({
      order_id: order.id,
      item_id: l.itemId,
      qty: l.qty,
      unit_price: price.get(l.itemId) ?? 0,
    })),
  );
  if (le) {
    try {
      await sb.from("orders").delete().eq("id", order.id);
    } catch {} // if this fails too, existingOrder() cleans it up on the retry
    return { ok: false, code: failCode(le) };
  }
  return { ok: true, id: order.id };
}
