import { db } from "./supabase";
import { normalizePhone } from "./phone";
import { getMenu } from "./data";
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

/**
 * mode "open"  → regular order, capacity enforced, status confirmed
 * mode "late"  → after cutoff, becomes a late_request for admin approval
 * mode "admin" → entered by the cook (e.g. from WhatsApp), no checks, confirmed
 *
 * The capacity check, the home-stop limit, the customer upsert and the order + lines insert all happen inside ONE
 * database transaction (create_order_atomic, migration 0009) that locks the cycle, so two orders arriving at the same
 * moment can never both take the last portions, and a failure saves nothing at all.
 *
 * Returns errNetwork (never throws) when the database is unreachable; the form retries with the same idempotency key,
 * and the function returns the original order for a repeated key instead of creating a duplicate.
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
  const menu = await getMenu(true);
  const price = new Map(menu.map((m) => [m.id, m.price]));
  if (p.lines.some((l) => !price.has(l.itemId))) return { ok: false, code: "errItems" };

  // Distance limit: depends only on this request and the cycle's settings (no shared counter), so it cannot race.
  // It can only be checked when we know both points; text-only locations are left to the cook.
  if (
    p.home && mode !== "admin" && cycle.home_enabled &&
    cycle.home_max_km != null &&
    cycle.kitchen_lat != null && cycle.kitchen_lng != null &&
    p.home.lat != null && p.home.lng != null &&
    haversineKm({ lat: cycle.kitchen_lat, lng: cycle.kitchen_lng }, { lat: p.home.lat, lng: p.home.lng }) > cycle.home_max_km
  ) {
    return { ok: false, code: "errTooFar", n: cycle.home_max_km };
  }

  const total = p.lines.reduce((s, l) => s + l.qty * (price.get(l.itemId) ?? 0), 0);
  const { data, error } = await db().rpc("create_order_atomic", {
    p_cycle: cycle.id,
    p_mode: mode,
    p_customer: { phone: p.phone, name: p.name, office_id: p.officeId, sms_opt_in: p.smsOptIn },
    p_order: {
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
    },
    p_lines: p.lines.map((l) => ({ item_id: l.itemId, qty: l.qty, unit_price: price.get(l.itemId) ?? 0 })),
  });
  if (error) return { ok: false, code: failCode(error) };

  const r = data as { ok?: boolean; id?: string; code?: OrderErrorCode; left?: number } | null;
  if (!r?.ok || !r.id) return { ok: false, code: r?.code ?? "errGeneric", n: r?.left };
  return { ok: true, id: r.id };
}