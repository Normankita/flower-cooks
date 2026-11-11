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
    status: "open",
  });
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
  const { error } = await db()
    .from("cycles")
    .update({
      title: str(fd, "title").slice(0, 80) || "Biriani ya Ijumaa",
      closes_at: closes.toISOString(),
      delivery_at: delivery.toISOString(),
      capacity: Math.max(1, int(fd, "capacity", 60)),
      lipa_namba: str(fd, "lipa_namba").slice(0, 20) || null,
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
