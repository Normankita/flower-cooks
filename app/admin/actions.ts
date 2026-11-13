"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkPin, createSession, destroySession, requireAdmin } from "@/lib/auth";
import { clearFailures, clientIp, getLockState, recordFailure } from "@/lib/login-guard";
import { db } from "@/lib/supabase";
import { getCurrentCycle } from "@/lib/data";
import { createOrder, parseOrderForm } from "@/lib/orders";
import { nextWeekdayEAT, parseEATInput } from "@/lib/time";
import { strings } from "@/lib/i18n";
import { DbUnavailableError } from "@/lib/db-error";
import { inTanzania } from "@/lib/geo";
import { matchSms, normalizeRef, type SmsOrder, type SmsStatus } from "@/lib/sms-match";
import { fail, fromDb, type ActionResult } from "@/lib/result";

type FormState = { error?: string; retry?: boolean; redirectTo?: string };
const refresh = () => revalidatePath("/admin", "layout");
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (fd: FormData, k: string, d = 0) => {
  const n = Math.round(Number(fd.get(k)));
  return Number.isFinite(n) ? n : d;
};
/** Revalidate on success and convert the DB error (if any) into an ActionResult. */
const finish = (error: { message: string } | null): ActionResult => {
  if (!error) refresh();
  return fromDb(error);
};

/* ---------- auth ---------- */
export async function loginAction(fd: FormData) {
  const ip = await clientIp();

  // Locked IPs are refused BEFORE the PIN is checked, so guessing while locked reveals nothing.
  const before = await getLockState(ip);
  if (before.locked) redirect(`/admin/login?e=locked&m=${before.minutes}`);

  if (!checkPin(str(fd, "pin"))) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    await recordFailure(ip);
    const after = await getLockState(ip);
    if (after.locked) redirect(`/admin/login?e=locked&m=${after.minutes}`);
    redirect(`/admin/login?e=1&left=${after.left}`);
  }

  await clearFailures(ip);
  await createSession();
  redirect("/admin");
}

export async function logoutAction() {
  await destroySession();
  redirect("/admin/login");
}

/* ---------- orders ---------- */
export async function setOrderStatus(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const status = str(fd, "status");
  if (!["confirmed", "declined", "cancelled", "delivered"].includes(status)) return fail("Hali si sahihi.");
  const patch: Record<string, unknown> = { status };
  if (status === "delivered") patch.delivered_at = new Date().toISOString();
  const { error } = await db().from("orders").update(patch).eq("id", str(fd, "order_id"));
  return finish(error);
}

export async function setPayment(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const paid = str(fd, "paid") === "1";
  const ref = str(fd, "ref").slice(0, 40);
  const patch: Record<string, unknown> = paid
    ? { payment_status: "paid", paid_at: new Date().toISOString() }
    : { payment_status: "unpaid", paid_at: null };
  if (paid && ref) patch.payment_ref = ref;
  const { error } = await db().from("orders").update(patch).eq("id", str(fd, "order_id"));
  return finish(error);
}

/* ---------- confirm payments from pasted SMS ---------- */
export type SmsRow = {
  orderId: string;
  name: string;
  total: number;
  ref: string;
  status: SmsStatus;
  snippet: string | null;
  phoneSeen: boolean;
};
type SmsOrderRow = { id: string; total: number; payment_ref: string | null; customers: { name: string; phone: string } | null };

/** Orders whose customer reported a transaction ID, plus references already used on paid orders (all cycles). */
async function smsCandidates() {
  const sb = db();
  const [rep, used] = await Promise.all([
    sb
      .from("orders")
      .select("id,total,payment_ref,customers(name,phone)")
      .eq("payment_status", "reported")
      .in("status", ["confirmed", "delivered"])
      .not("payment_ref", "is", null)
      .limit(300),
    sb.from("orders").select("payment_ref").eq("payment_status", "paid").not("payment_ref", "is", null).limit(5000),
  ]);
  if (rep.error || used.error) throw new Error((rep.error ?? used.error)?.message);
  const orders: SmsOrder[] = ((rep.data ?? []) as unknown as SmsOrderRow[]).map((o) => ({
    id: o.id,
    name: o.customers?.name ?? "",
    phone: o.customers?.phone ?? "",
    total: o.total,
    ref: o.payment_ref ?? "",
  }));
  const usedRefs = new Set(((used.data ?? []) as { payment_ref: string }[]).map((r) => normalizeRef(r.payment_ref)));
  return { orders, usedRefs };
}

/** Step 1 (changes nothing): match the pasted SMS text against reported payments. */
export async function previewSms(fd: FormData): Promise<{ ok: boolean; error?: string; rows?: SmsRow[] }> {
  await requireAdmin();
  const text = String(fd.get("sms") ?? "").slice(0, 30_000);
  if (text.trim().length < 10) return { ok: false, error: "Bandika ujumbe wa SMS kwanza." };
  try {
    const { orders, usedRefs } = await smsCandidates();
    if (orders.length === 0) return { ok: false, error: "Hakuna malipo yanayosubiri kuthibitishwa." };
    const byId = new Map(orders.map((o) => [o.id, o]));
    const rows = matchSms(text, orders, usedRefs).map((m) => ({
      orderId: m.orderId,
      name: byId.get(m.orderId)?.name ?? "",
      total: byId.get(m.orderId)?.total ?? 0,
      ref: byId.get(m.orderId)?.ref ?? m.ref,
      status: m.status,
      snippet: m.snippet,
      phoneSeen: m.phoneSeen,
    }));
    return { ok: true, rows };
  } catch {
    return { ok: false, error: "Tatizo la mtandao. Jaribu tena." };
  }
}

/**
 * Step 2: mark the chosen orders paid. The match is recomputed here from the pasted text (the browser's list is not
 * trusted): only orders whose reference really is in the text, and not duplicates, can be confirmed.
 */
export async function confirmSms(fd: FormData): Promise<{ ok: boolean; error?: string; applied?: number }> {
  await requireAdmin();
  const text = String(fd.get("sms") ?? "").slice(0, 30_000);
  const ids = new Set(fd.getAll("ids").map(String));
  if (ids.size === 0) return { ok: false, error: "Hakuna oda iliyochaguliwa." };
  try {
    const { orders, usedRefs } = await smsCandidates();
    const ok = matchSms(text, orders, usedRefs).filter((m) => ids.has(m.orderId) && (m.status === "ready" || m.status === "check"));
    let applied = 0;
    for (const m of ok) {
      const { data, error } = await db()
        .from("orders")
        .update({ payment_status: "paid", paid_at: new Date().toISOString() })
        .eq("id", m.orderId)
        .eq("payment_status", "reported")
        .select("id");
      if (error) return { ok: false, error: fromDb(error).error, applied };
      applied += data?.length ?? 0;
    }
    refresh();
    return { ok: true, applied };
  } catch {
    return { ok: false, error: "Tatizo la mtandao. Jaribu tena." };
  }
}

export async function adminPlaceOrder(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  let cycle;
  try {
    cycle = await getCurrentCycle();
  } catch (e) {
    if (e instanceof DbUnavailableError) return { error: strings("sw").errNetwork, retry: true };
    throw e;
  }
  if (!cycle) return { error: "Hakuna mzunguko. Tengeneza mzunguko kwanza." };
  const parsed = parseOrderForm(fd);
  if (!parsed.ok) return { error: strings("sw")[parsed.code] };
  const res = await createOrder(cycle, parsed.value, "admin");
  if (!res.ok) return { error: strings("sw")[res.code], retry: res.code === "errNetwork" };
  refresh();
  return { redirectTo: "/admin/orders" };
}

/* ---------- cycles ---------- */
export async function createCycle(): Promise<ActionResult> {
  await requireAdmin();
  let prev;
  try {
    prev = await getCurrentCycle();
  } catch {
    return fail("Tatizo la mtandao. Jaribu tena.");
  }
  const closes = nextWeekdayEAT(4, 20, 0); // Thursday 20:00 EAT
  const delivery = nextWeekdayEAT(5, 13, 0, closes); // Friday 13:00 EAT
  const label = new Intl.DateTimeFormat("sw-TZ", { timeZone: "Africa/Dar_es_Salaam", day: "numeric", month: "short" }).format(delivery);
  const { error } = await db().from("cycles").insert({
    title: `Biriani ya Ijumaa ${label}`,
    opens_at: new Date().toISOString(),
    closes_at: closes.toISOString(),
    delivery_at: delivery.toISOString(),
    capacity: prev?.capacity ?? 60,
    lipa_namba: prev?.lipa_namba ?? null,
    lipa_name: prev?.lipa_name ?? null,
    status: "open",
    // home-delivery settings carry over from the previous cycle
    home_enabled: prev?.home_enabled ?? false,
    home_max_stops: prev?.home_max_stops ?? null,
    home_max_km: prev?.home_max_km ?? null,
    kitchen_lat: prev?.kitchen_lat ?? null,
    kitchen_lng: prev?.kitchen_lng ?? null,
  });

  // Privacy: forget customers' home locations 30 days after the order (best effort; ignore failures).
  if (!error) {
    await db()
      .from("orders")
      .update({ delivery_lat: null, delivery_lng: null, delivery_accuracy_m: null, location_url: null })
      .eq("delivery_type", "home")
      .lt("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  }
  return finish(error);
}

export async function toggleCycle(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const status = str(fd, "status") === "closed" ? "closed" : "open";
  const { error } = await db().from("cycles").update({ status }).eq("id", str(fd, "cycle_id"));
  return finish(error);
}

export async function saveCycle(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const closes = parseEATInput(str(fd, "closes_at"));
  const delivery = parseEATInput(str(fd, "delivery_at"));
  if (!closes || !delivery) return fail("Tarehe si sahihi.");

  // Home delivery controls. Empty limit = no limit. Kitchen position: both numbers inside Tanzania, or both empty.
  const stopsRaw = str(fd, "home_max_stops");
  const kmRaw = str(fd, "home_max_km");
  const km = Number(kmRaw);
  const latRaw = str(fd, "kitchen_lat");
  const lngRaw = str(fd, "kitchen_lng");
  let kitchen: { lat: number; lng: number } | null = null;
  if (latRaw || lngRaw) {
    kitchen = { lat: Number(latRaw), lng: Number(lngRaw) };
    if (!latRaw || !lngRaw || !Number.isFinite(kitchen.lat) || !Number.isFinite(kitchen.lng) || !inTanzania(kitchen)) {
      return fail("Eneo la jiko si sahihi (lazima liwe ndani ya Tanzania).");
    }
  }

  const { error } = await db()
    .from("cycles")
    .update({
      title: str(fd, "title").slice(0, 80) || "Biriani ya Ijumaa",
      closes_at: closes.toISOString(),
      delivery_at: delivery.toISOString(),
      capacity: Math.max(1, int(fd, "capacity", 60)),
      lipa_namba: str(fd, "lipa_namba").slice(0, 20) || null,
      lipa_name: str(fd, "lipa_name").slice(0, 60).toUpperCase() || null,
      home_enabled: fd.get("home_enabled") === "on",
      home_max_stops: stopsRaw ? Math.min(Math.max(0, int(fd, "home_max_stops")), 500) : null,
      home_max_km: kmRaw && Number.isFinite(km) && km > 0 ? Math.min(Math.round(km * 10) / 10, 999) : null,
      kitchen_lat: kitchen ? Math.round(kitchen.lat * 1e6) / 1e6 : null,
      kitchen_lng: kitchen ? Math.round(kitchen.lng * 1e6) / 1e6 : null,
    })
    .eq("id", str(fd, "cycle_id"));
  return finish(error);
}

/* ---------- menu & offices ---------- */
export async function saveItem(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const row = {
    name: str(fd, "name").slice(0, 60),
    price: Math.max(0, int(fd, "price")),
    rice_kg: Math.max(0, Number(fd.get("rice_kg")) || 0),
    protein_kg: Math.max(0, Number(fd.get("protein_kg")) || 0),
    active: fd.get("active") === "on",
  };
  if (!row.name) return fail("Andika jina la menyu.");
  const id = str(fd, "id");
  const { error } = id
    ? await db().from("menu_items").update(row).eq("id", id)
    : await db().from("menu_items").insert({ ...row, active: true, sort: 99 });
  return finish(error);
}

export async function saveOffice(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = str(fd, "name").slice(0, 60);
  if (!name) return fail("Andika jina la ofisi.");
  const id = str(fd, "id");
  const { error } = id
    ? await db().from("offices").update({ name, active: fd.get("active") === "on" }).eq("id", id)
    : await db().from("offices").insert({ name, sort: 99 });
  return finish(error);
}
