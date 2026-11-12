import assert from "node:assert/strict";
import { normalizePhone } from "../lib/phone.ts";
import { nextWeekdayEAT, parseEATInput, toEATInput } from "../lib/time.ts";
import { summarize } from "../lib/summary.ts";
import { cycleMode } from "../lib/cycle.ts";
import { isNetworkMessage, RETRY_DELAYS_S } from "../lib/db-error.ts";
import { normalizeSupabaseUrl } from "../lib/supabase-url.ts";
import { csvCell, toCsv } from "../lib/csv.ts";
import { resolveTheme } from "../lib/theme.ts";
import { lockState } from "../lib/lockout.ts";
import { fmtKm, haversineKm, inTanzania, navUrl, normalizeMapUrl, orderStops, parseHome, parseLatLng, routeUrls } from "../lib/geo.ts";

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
// geo
const dodoma = { lat: -6.163, lng: 35.7516 };
assert.ok(Math.abs(haversineKm(dodoma, dodoma)) < 1e-9);
assert.ok(Math.abs(haversineKm({ lat: -6.163, lng: 35.7516 }, { lat: -6.163, lng: 35.8516 }) - 11.0) < 0.2); // 0.1° lng ≈ 11 km at this latitude
assert.ok(Math.abs(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111.19) < 0.1);
assert.equal(fmtKm(0.85), "~850 m");
assert.equal(fmtKm(3.24), "~3.2 km");
assert.equal(inTanzania(dodoma), true);
assert.equal(inTanzania({ lat: 0, lng: 0 }), false);
assert.equal(inTanzania({ lat: 35.7516, lng: -6.163 }), false); // swapped
assert.deepEqual(parseLatLng("-6.1630, 35.7516"), dodoma);
assert.deepEqual(parseLatLng("https://maps.google.com/?q=-6.1630,35.7516"), dodoma); // WhatsApp location link
assert.deepEqual(parseLatLng("https://www.google.com/maps/@-6.1630,35.7516,17z"), dodoma);
assert.deepEqual(parseLatLng("https://www.google.com/maps/place/X/data=!3d-6.1630!4d35.7516"), dodoma);
assert.deepEqual(parseLatLng("https://www.google.com/maps?q=-6.1630%2C35.7516"), dodoma);
assert.equal(parseLatLng("https://maps.app.goo.gl/AbCdEf123"), null); // short link: no coordinates inside
assert.equal(parseLatLng("karibu na kanisa"), null);
assert.equal(parseLatLng("100.5, 200.5"), null); // out of range
assert.equal(parseLatLng("%E0%A4%A -6.1,35.7"), null); // malformed escapes don't throw
assert.equal(normalizeMapUrl("https://maps.app.goo.gl/AbCdEf123"), "https://maps.app.goo.gl/AbCdEf123");
assert.equal(normalizeMapUrl("https://www.google.com/maps?q=-6.16,35.75"), "https://www.google.com/maps?q=-6.16,35.75");
assert.equal(normalizeMapUrl("https://www.google.com/search?q=evil"), null); // google.com but not /maps
assert.equal(normalizeMapUrl("http://maps.google.com/?q=1,2"), null); // not https
assert.equal(normalizeMapUrl("https://evil.example.com/maps"), null);
assert.equal(normalizeMapUrl("https://maps.google.com.evil.com/"), null); // look-alike host
assert.equal(normalizeMapUrl("javascript:alert(1)"), null);
assert.equal(normalizeMapUrl(""), null);
assert.equal(navUrl(dodoma), "https://www.google.com/maps/dir/?api=1&destination=-6.163,35.7516&travelmode=driving");
// home form validation
assert.deepEqual(parseHome({ landmark: "" }), { ok: false, code: "errLandmark" });
assert.deepEqual(parseHome({ landmark: "ab" }), { ok: false, code: "errLandmark" });
assert.deepEqual(parseHome({ landmark: "Karibu na kanisa" }), { ok: true, home: { lat: null, lng: null, accuracyM: null, url: null } });
assert.deepEqual(parseHome({ landmark: "geti la bluu", lat: "-6.1630004", lng: "35.7516", accuracy: "35.4" }), { ok: true, home: { lat: -6.163, lng: 35.7516, accuracyM: 35, url: null } });
assert.deepEqual(parseHome({ landmark: "x y z", lat: "0", lng: "0" }), { ok: false, code: "errLocation" }); // outside Tanzania
assert.deepEqual(parseHome({ landmark: "x y z", lat: "-6.1" }), { ok: false, code: "errLocation" }); // lat without lng
assert.deepEqual(parseHome({ landmark: "x y z", lat: "abc", lng: "def" }), { ok: false, code: "errLocation" });
const viaLink = parseHome({ landmark: "x y z", link: "https://maps.google.com/?q=-6.1630,35.7516" });
assert.deepEqual(viaLink, { ok: true, home: { lat: -6.163, lng: 35.7516, accuracyM: null, url: "https://maps.google.com/?q=-6.1630,35.7516" } });
const shortLink = parseHome({ landmark: "x y z", link: "https://maps.app.goo.gl/AbC123" });
assert.deepEqual(shortLink, { ok: true, home: { lat: null, lng: null, accuracyM: null, url: "https://maps.app.goo.gl/AbC123" } }); // kept for navigation, no distance
assert.deepEqual(parseHome({ landmark: "x y z", link: "https://evil.example.com/x" }), { ok: false, code: "errLocation" });
assert.deepEqual(parseHome({ landmark: "x y z", link: "-6.1630, 35.7516" }), { ok: true, home: { lat: -6.163, lng: 35.7516, accuracyM: null, url: null } });
assert.deepEqual(parseHome({ landmark: "x y z", link: "10.5, 20.5" }), { ok: false, code: "errLocation" });
assert.deepEqual(parseHome({ landmark: "x y z", lat: "-6.2", lng: "35.8", link: "https://maps.google.com/?q=-6.1630,35.7516" }), { ok: true, home: { lat: -6.2, lng: 35.8, accuracyM: null, url: "https://maps.google.com/?q=-6.1630,35.7516" } }); // GPS wins
// nearest-neighbour order: from the kitchen go to the closest first, then onwards
const K = { lat: 0, lng: 0 };
const st = (lng: number, n: string) => ({ at: { lat: 0, lng }, item: n });
assert.deepEqual(orderStops(K, [st(0.3, "far"), st(0.1, "near"), st(0.2, "mid")]).map((s) => s.item), ["near", "mid", "far"]);
assert.deepEqual(orderStops(K, []), []);
// route links: split every N stops, each link starts where the previous one ended
const pts = [1, 2, 3, 4, 5].map((n) => ({ lat: n, lng: n }));
const links = routeUrls(K, pts, 2);
assert.equal(links.length, 3);
assert.ok(links[0].includes("origin=0%2C0") && links[0].includes("destination=2%2C2") && links[0].includes("waypoints=1%2C1"));
assert.ok(links[1].includes("origin=2%2C2") && links[1].includes("destination=4%2C4"));
assert.ok(links[2].includes("origin=4%2C4") && links[2].includes("destination=5%2C5") && !links[2].includes("waypoints"));
assert.equal(routeUrls(null, pts, 10).length, 1);
assert.ok(!routeUrls(null, pts, 10)[0].includes("origin="));
assert.deepEqual(routeUrls(K, []), []);
// login lockout
const T = Date.parse("2026-11-12T10:00:00Z");
const min = (n: number) => n * 60_000;
assert.deepEqual(lockState([], T), { locked: false, failures: 0, left: 5, minutes: 0 });
assert.equal(lockState([T - min(1), T - min(2), T - min(3), T - min(4)], T).locked, false);
assert.equal(lockState([T - min(1), T - min(2), T - min(3), T - min(4)], T).left, 1);
const five = [T - min(5), T - min(4), T - min(3), T - min(2), T - min(1)];
assert.equal(lockState(five, T).locked, true);
assert.equal(lockState(five, T).minutes, 29); // lock ends 30 min after the LAST failure (1 min ago)
assert.equal(lockState(five, T + min(28)).locked, true); // still locked 1 min before the end...
assert.equal(lockState(five, T + min(28)).minutes, 1);
assert.equal(lockState(five, T + min(29)).locked, false); // ...and over exactly 30 min after the last failure
assert.equal(lockState(five, T + min(29)).left, 5); // fresh start afterwards
// a slow burst (first failure 29 min before the last) is still a lock, and the old failure expiring can't lift it early
const slow = [T - min(29), T - min(4), T - min(3), T - min(2), T - min(1)];
assert.equal(lockState(slow, T).locked, true);
assert.equal(lockState(slow, T + min(1)).locked, true); // first failure is now 30 min old; lock must hold
assert.equal(lockState([T - min(40), T - min(35), T - min(31), T - min(2), T - min(1)], T).locked, false); // old failures don't count
assert.equal(lockState([T - min(40), T - min(35), T - min(31), T - min(2), T - min(1)], T).left, 3);
// theme
assert.equal(resolveTheme("dark", false), "dark");
assert.equal(resolveTheme("light", true), "light");
assert.equal(resolveTheme("system", true), "dark");
assert.equal(resolveTheme("system", false), "light");
assert.equal(resolveTheme(null, true), "dark");
assert.equal(resolveTheme(undefined, false), "light");
assert.equal(resolveTheme("garbage", true), "dark");
// csv
assert.equal(csvCell("plain"), "plain");
assert.equal(csvCell(null), "");
assert.equal(csvCell(undefined), "");
assert.equal(csvCell(8000), "8000");
assert.equal(csvCell(NaN), "");
assert.equal(csvCell("a,b"), '"a,b"');
assert.equal(csvCell('say "hi"'), '"say ""hi"""');
assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
assert.equal(csvCell("=HYPERLINK(\"http://x\")"), '"\'=HYPERLINK(""http://x"")"'); // formula neutralised + quoted
assert.equal(csvCell("+255712345678"), "'+255712345678");
assert.equal(csvCell("-5"), "'-5");
assert.equal(csvCell("@cmd"), "'@cmd");
assert.equal(csvCell("0712 345 678"), "0712 345 678");
assert.equal(toCsv([["Jina", "Jumla"], ["Asha, M", 16000]]), '﻿Jina,Jumla\r\n"Asha, M",16000\r\n');
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
