import assert from "node:assert/strict";
import { normalizePhone } from "../lib/phone.ts";
import { nextWeekdayEAT, parseEATInput, toEATInput } from "../lib/time.ts";
import { summarize } from "../lib/summary.ts";
import { cycleMode } from "../lib/cycle.ts";
import { isNetworkMessage, RETRY_DELAYS_S } from "../lib/db-error.ts";
import { normalizeSupabaseUrl } from "../lib/supabase-url.ts";

// phones
assert.equal(normalizePhone("0712 345 678"), "255712345678");
assert.equal(normalizePhone("+255 712-345-678"), "255712345678");
assert.equal(normalizePhone("255655123456"), "255655123456");
assert.equal(normalizePhone("0512345678"), null);
assert.equal(normalizePhone("12345"), null);

// time: Mon 2026-11-09 16:22 EAT -> next Thursday 20:00 EAT = Thu 2026-11-12 17:00Z
const from = new Date("2026-11-09T13:22:00Z");
const closes = nextWeekdayEAT(4, 20, 0, from);
assert.equal(closes.toISOString(), "2026-11-12T17:00:00.000Z");
const delivery = nextWeekdayEAT(5, 13, 0, closes);
assert.equal(delivery.toISOString(), "2026-11-13T10:00:00.000Z");
// If it's Thursday 21:00 EAT (past cutoff) -> next week
const thuLate = new Date("2026-11-12T18:00:00Z");
assert.equal(nextWeekdayEAT(4, 20, 0, thuLate).toISOString(), "2026-11-19T17:00:00.000Z");
// datetime-local round trip
assert.equal(toEATInput(closes), "2026-11-12T20:00");
assert.equal(parseEATInput("2026-11-12T20:00")!.toISOString(), closes.toISOString());

// summary
const line = (item_id: string, name: string, qty: number) => ({ id: item_id + qty, item_id, qty, unit_price: 8000, menu_items: { name, rice_kg: 0.25, protein_kg: 0.2 } });
type OrderArg = Parameters<typeof summarize>[0][number];
const o = (status: string, pay: string, total: number, lines: ReturnType<typeof line>[], cid = "c1") =>
  ({ status, payment_status: pay, total, order_lines: lines, customers: { id: cid } }) as unknown as OrderArg;
const s = summarize([
  o("confirmed", "paid", 16000, [line("m", "Nyama", 2)]),
  o("delivered", "unpaid", 8000, [line("k", "Kuku", 1)], "c2"),
  o("late_request", "unpaid", 8000, [line("m", "Nyama", 1)], "c3"),
  o("cancelled", "unpaid", 8000, [line("m", "Nyama", 5)], "c4"),
]);
assert.equal(s.portions, 3);
assert.equal(s.rice.toFixed(2), "0.75");
assert.equal(s.protein.toFixed(2), "0.60");
assert.equal(s.revenue, 24000);
assert.equal(s.paid, 16000);
assert.equal(s.unpaid, 8000);
assert.equal(s.lateCount, 1);
assert.equal(s.customers, 2);
// cycle mode
const cyc = { status: "open" as const, opens_at: "2026-11-07T07:00:00Z", closes_at: "2026-11-12T17:00:00Z", delivery_at: "2026-11-13T10:00:00Z" };
assert.equal(cycleMode(null), "none");
assert.equal(cycleMode(cyc, new Date("2026-11-06T00:00:00Z")), "not_yet");
assert.equal(cycleMode(cyc, new Date("2026-11-10T00:00:00Z")), "open");
assert.equal(cycleMode(cyc, new Date("2026-11-12T18:00:00Z")), "late");
assert.equal(cycleMode(cyc, new Date("2026-11-13T10:00:00Z")), "closed");
assert.equal(cycleMode({ ...cyc, status: "closed" }, new Date("2026-11-10T00:00:00Z")), "closed");
// supabase url cleanup
assert.equal(normalizeSupabaseUrl("https://abc.supabase.co"), "https://abc.supabase.co");
assert.equal(normalizeSupabaseUrl('"https://abc.supabase.co/rest/v1/"'), "https://abc.supabase.co");
assert.equal(normalizeSupabaseUrl("  abc.supabase.co \n"), "https://abc.supabase.co");
assert.equal(normalizeSupabaseUrl(""), "");
assert.equal(normalizeSupabaseUrl(undefined), "");
// network error detection
assert.equal(isNetworkMessage("TypeError: fetch failed"), true);
assert.equal(isNetworkMessage("TimeoutError: The operation was aborted due to timeout"), true);
assert.equal(isNetworkMessage("getaddrinfo ENOTFOUND x.supabase.co"), true);
assert.equal(isNetworkMessage('duplicate key value violates unique constraint "orders_idempotency_key_key"'), false);
assert.equal(isNetworkMessage('Invalid path specified in request URL'), false);
assert.equal(isNetworkMessage(null), false);
assert.ok(RETRY_DELAYS_S.length >= 3 && RETRY_DELAYS_S.every((d, i) => i === 0 || d >= RETRY_DELAYS_S[i - 1]));
console.log("all unit checks passed");
