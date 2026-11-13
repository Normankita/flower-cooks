import { db } from "./supabase";
import { cycleMode, getCurrentCycle, must } from "./data";
import { audience, buildMessage, dayAllows, smsSegments, type Cust, type Kind, type OrderLite } from "./reminders";
import { sendSms, smsConfigured } from "./sms";
import { fmtShortEAT } from "./time";
import type { Cycle } from "./types";

const STALE_QUEUED_MS = 10 * 60_000; // a "queued" row older than this is a crashed send: retry it
export const MAX_PER_RUN = 200;

const brand = () => process.env.NEXT_PUBLIC_BRAND ?? "Biriani ya Ijumaa";
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");

export type Plan =
  | { ok: false; reason: string }
  | { ok: true; cycle: Cycle; recipients: Cust[]; optedIn: number; alreadySent: number };

type LogRow = { customer_id: string; status: string; created_at: string };

/** Who would get this reminder right now (read-only). */
export async function planReminder(kind: Kind, opts: { force?: boolean; now?: number } = {}): Promise<Plan> {
  const now = opts.now ?? Date.now();
  const cycle = await getCurrentCycle();
  if (!cycle) return { ok: false, reason: "Hakuna mzunguko." };
  const mode = cycleMode(cycle, new Date(now));
  if (kind !== "fri" && mode !== "open") return { ok: false, reason: "Oda hazipokelewi sasa, hakuna kikumbusho cha kutuma." };
  if (!dayAllows(kind, now, !!opts.force)) return { ok: false, reason: "Leo si siku ya kikumbusho hiki." };

  const sb = db();
  const [cust, ords, logged] = await Promise.all([
    sb.from("customers").select("id,name,phone,unsub_token").eq("sms_opt_in", true).limit(5000),
    sb.from("orders").select("customer_id,status").eq("cycle_id", cycle.id),
    sb.from("message_log").select("customer_id,status,created_at").eq("cycle_id", cycle.id).eq("channel", "sms").eq("kind", kind),
  ]);
  const optedIn = (must(cust, "optedIn") as Cust[] | null) ?? [];
  const orders = (must(ords, "cycleOrders") as OrderLite[] | null) ?? [];
  const rows = (must(logged, "messageLog") as LogRow[] | null) ?? [];
  // sent, or still in flight: not eligible. failed / stale-queued rows are retried.
  const done = new Set(
    rows.filter((r) => r.status === "sent" || (r.status === "queued" && now - new Date(r.created_at).getTime() < STALE_QUEUED_MS)).map((r) => r.customer_id),
  );
  return { ok: true, cycle, recipients: audience(kind, optedIn, orders, done), optedIn: optedIn.length, alreadySent: done.size };
}

export type RunSummary = { ok: boolean; reason?: string; dry: boolean; planned: number; sent: number; failed: number; segments: number; sample?: string };

/**
 * Send (or, with dry:true, only count) a reminder to the planned recipients.
 * Idempotent: each (cycle, customer, kind) gets one log row (unique index), written BEFORE sending, so a second run
 * or a retry never texts anyone twice. Failed / crashed attempts are cleared and retried on the next run.
 */
export async function runReminder(kind: Kind, opts: { dry?: boolean; force?: boolean; limit?: number } = {}): Promise<RunSummary> {
  const dry = !!opts.dry;
  const empty = { dry, planned: 0, sent: 0, failed: 0, segments: 0 };
  if (!site()) return { ok: false, reason: "NEXT_PUBLIC_SITE_URL haijawekwa.", ...empty };
  if (!dry && !smsConfigured()) return { ok: false, reason: "SMS haijawekwa (angalia NEXTSMS_* kwenye mipangilio).", ...empty };

  const plan = await planReminder(kind, { force: opts.force });
  if (!plan.ok) return { ok: false, reason: plan.reason, ...empty };

  const recipients = plan.recipients.slice(0, opts.limit ?? MAX_PER_RUN);
  const textFor = (c: Cust) =>
    buildMessage(kind, { brand: brand(), site: site(), closes: fmtShortEAT(plan.cycle.closes_at), unsubUrl: `${site()}/u/${c.unsub_token}` });
  const segments = recipients.reduce((s, c) => s + smsSegments(textFor(c)).segments, 0);
  if (dry) return { ok: true, dry, planned: recipients.length, sent: 0, failed: 0, segments, sample: recipients[0] ? textFor(recipients[0]) : undefined };
  if (recipients.length === 0) return { ok: true, ...empty };

  const sb = db();
  // clear failed / crashed attempts of this kind so they can be retried (sent rows stay: they block re-sending)
  await sb.from("message_log").delete().eq("cycle_id", plan.cycle.id).eq("channel", "sms").eq("kind", kind).eq("status", "failed");
  await sb
    .from("message_log")
    .delete()
    .eq("cycle_id", plan.cycle.id)
    .eq("channel", "sms")
    .eq("kind", kind)
    .eq("status", "queued")
    .lt("created_at", new Date(Date.now() - STALE_QUEUED_MS).toISOString());

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i += 5) {
    await Promise.all(
      recipients.slice(i, i + 5).map(async (c) => {
        const ins = await sb.from("message_log").insert({ cycle_id: plan.cycle.id, customer_id: c.id, channel: "sms", kind, status: "queued" }).select("id").single();
        if (ins.error?.code === "23505") return; // somebody else (a parallel run) already claimed this recipient
        if (ins.error || !ins.data) {
          failed++;
          return;
        }
        const res = await sendSms(c.phone, textFor(c), `fc-${kind}-${String(ins.data.id).slice(0, 8)}`);
        if (res.ok) {
          sent++;
          await sb.from("message_log").update({ status: "sent", provider_ref: res.ref }).eq("id", ins.data.id);
        } else {
          failed++;
          await sb.from("message_log").update({ status: "failed", error: res.error.slice(0, 200) }).eq("id", ins.data.id);
        }
      }),
    );
  }
  return { ok: true, dry, planned: recipients.length, sent, failed, segments };
}

/* ---------- WhatsApp one-tap helper (free: the cook taps each link) ---------- */

export type WaRow = { id: string; name: string; phone: string; text: string; sent: boolean };

/** Customers to message on WhatsApp for this kind (the cook sends each herself, so no opt-in column is needed). */
export async function whatsappList(kind: Kind, now = Date.now()): Promise<{ ok: false; reason: string } | { ok: true; rows: WaRow[] }> {
  const cycle = await getCurrentCycle();
  if (!cycle) return { ok: false, reason: "Hakuna mzunguko." };
  const sb = db();
  const [cust, ords, logged] = await Promise.all([
    sb.from("customers").select("id,name,phone,unsub_token").order("name").limit(500),
    sb.from("orders").select("customer_id,status").eq("cycle_id", cycle.id),
    sb.from("message_log").select("customer_id,status,created_at").eq("cycle_id", cycle.id).eq("channel", "whatsapp").eq("kind", kind),
  ]);
  const all = (must(cust, "customers") as Cust[] | null) ?? [];
  const orders = (must(ords, "cycleOrders") as OrderLite[] | null) ?? [];
  const done = new Set(((must(logged, "waLog") as LogRow[] | null) ?? []).map((r) => r.customer_id));
  const eligible = audience(kind, all, orders, new Set()); // not filtered by "already sent": we show them ticked instead
  const text = (c: Cust) => `Habari ${c.name.split(" ")[0]}, ` + buildMessage(kind, { brand: brand(), site: site(), closes: fmtShortEAT(cycle.closes_at) });
  void now;
  return { ok: true, rows: eligible.map((c) => ({ id: c.id, name: c.name, phone: c.phone, text: text(c), sent: done.has(c.id) })) };
}

/** Tick a customer as messaged on WhatsApp for this kind (idempotent). */
export async function markWhatsApp(kind: Kind, customerId: string): Promise<void> {
  const cycle = await getCurrentCycle();
  if (!cycle) return;
  const { error } = await db().from("message_log").insert({ cycle_id: cycle.id, customer_id: customerId, channel: "whatsapp", kind, status: "sent" });
  if (error && error.code !== "23505") throw new Error(error.message);
}

/** Last sends for the admin page. */
export async function recentLog(cycleId: string) {
  const data = must(
    await db().from("message_log").select("id,kind,channel,status,error,created_at,customers(name)").eq("cycle_id", cycleId).order("created_at", { ascending: false }).limit(30),
    "recentLog",
  );
  return (data as unknown as { id: string; kind: string; channel: string; status: string; error: string | null; created_at: string; customers: { name: string } | null }[] | null) ?? [];
}
