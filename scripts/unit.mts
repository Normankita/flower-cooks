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
import { detectNetwork } from "../lib/mobile-network.ts";
import { normalizeStatus, parseCallback } from "../lib/azampay-callback.ts";
import { matchSms, receivedAmounts } from "../lib/sms-match.ts";
import { amountMatches, becameSuccess, nextStatus, shouldMarkOrderPaid } from "../lib/payments.ts";
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
// mobile network guess
assert.equal(detectNetwork("255744123456"), "Mpesa");
assert.equal(detectNetwork("255755123456"), "Mpesa");
assert.equal(detectNetwork("255765123456"), "Mpesa");
assert.equal(detectNetwork("255655123456"), "Tigo");
assert.equal(detectNetwork("255715123456"), "Tigo");
assert.equal(detectNetwork("255685123456"), "Airtel");
assert.equal(detectNetwork("255785123456"), "Airtel");
assert.equal(detectNetwork("255615123456"), "Halopesa");
assert.equal(detectNetwork("255625123456"), "Halopesa");
assert.equal(detectNetwork("255735123456"), null); // unknown prefix: customer must choose
assert.equal(detectNetwork("0744123456"), null); // not normalised
assert.equal(detectNetwork("25574412345"), null); // too short
// pasted SMS matching (formats below are approximations of real messages)
const mpesa = "QCD1A2B3C4 Confirmed. You have received Tsh10,000.00 from JUMA ALI 255762028554 on 13/11/26 at 1:12 PM. New M-Pesa balance is Tsh35,000.00.";
const tigo = "Umepokea TSh 8,000 kutoka kwa ASHA 0712345678. Kumbukumbu: 12345678901. Salio jipya TSh 50,000.";
const airtel = "Umepokea Tsh 10,000.00 kutoka 0689123456 ASHA. Muamala: CI251113.1234.A12345. Salio Tsh 20,000.00";
const O = (id: string, ref: string, total: number, phone = "255762028554") => ({ id, name: "N" + id, phone, total, ref });
const sms = [mpesa, tigo, airtel].join("\n\n");
let mm = matchSms(sms, [O("a", "qcd1a2b3c4", 10000), O("b", "12345678901", 8000, "255712345678"), O("c", "CI251113.1234.A12345", 10000, "255689123456"), O("d", "ZZZ999999", 10000)]);
assert.deepEqual(mm.map((m) => m.status), ["ready", "ready", "ready", "missing"]);
assert.equal(mm[0].phoneSeen, true); // customer's number appears in the M-Pesa message
assert.deepEqual(mm[0].amounts, [10000]); // the 35,000 balance is NOT counted as a payment
mm = matchSms(sms, [O("a", "QCD1A2B3C4", 35000)]);
assert.equal(mm[0].status, "check"); // balance trap: order total equals the BALANCE, not the received amount
mm = matchSms(sms, [O("a", "QCD1A2B3C4", 9000)]);
assert.equal(mm[0].status, "check"); // underpaid / wrong amount
mm = matchSms(sms, [O("a", "QCD1A2B3C4", 10000), O("b", "qcd1a2b3c4", 10000)]);
assert.deepEqual(mm.map((m) => m.status), ["duplicate", "duplicate"]); // same receipt claimed twice
mm = matchSms(sms, [O("a", "QCD1A2B3C4", 10000)], new Set(["QCD1A2B3C4"]));
assert.equal(mm[0].status, "duplicate"); // receipt already used on a paid order
mm = matchSms("xQCD1A2B3C4y received Tsh10,000", [O("a", "QCD1A2B3C4", 10000)]);
assert.equal(mm[0].status, "missing"); // reference glued to other letters is not a match
mm = matchSms(mpesa, [O("a", "ABC", 10000)]);
assert.equal(mm[0].status, "missing"); // refs shorter than 6 characters are never trusted
mm = matchSms(mpesa, [O("a", "QCD 1A2B 3C4", 10000)]);
assert.equal(mm[0].status, "ready"); // customer typed spaces in the ref
mm = matchSms(mpesa.replace(/\n/g, " ") + " " + tigo, [O("a", "QCD1A2B3C4", 10000), O("b", "12345678901", 8000)]);
assert.equal(mm[0].status, "ready"); // run-together messages (no blank lines) still work
assert.equal(matchSms("", [O("a", "QCD1A2B3C4", 10000)])[0].status, "missing");
assert.deepEqual(receivedAmounts("Umepokea TSh 8,000 kutoka X. Salio jipya TSh 50,000."), [8000]);
assert.deepEqual(receivedAmounts("Tsh 5,000/= imelipwa"), [5000]);
// payment state rules
const cb1 = parseCallback({ msisdn: "255700000000", amount: "1000", message: "Payment completed", utilityref: "fc123-ab12cd", operator: "Airtel", reference: "AZAM-9", transactionstatus: "success" });
assert.deepEqual(cb1, { externalId: "fc123-ab12cd", status: "success", amount: "1000", providerRef: "AZAM-9", message: "Payment completed", password: null });
assert.equal(parseCallback({ UtilityRef: "x1", TransactionStatus: "Success", Amount: 1000 })?.status, "success"); // case-insensitive
assert.equal(parseCallback({ data: { externalId: "x2", status: "FAILED", message: "Insufficient funds" } })?.status, "failed"); // nested
assert.equal(parseCallback({ utilityref: "x3", transactionstatus: "pending" })?.status, "unknown"); // unsure → unknown (changes nothing)
assert.equal(parseCallback({ utilityref: "x4" })?.status, "unknown"); // no status at all
assert.equal(parseCallback({ utilityref: "x5", success: true })?.status, "success");
assert.equal(parseCallback({ utilityref: "x6", transactionstatus: "failure" })?.status, "failed");
assert.equal(parseCallback({ utilityref: "x7", transactionstatus: "unsuccessful" })?.status, "failed");
assert.equal(parseCallback({ utilityref: "x8", password: "p@ss" })?.password, "p@ss");
assert.equal(parseCallback({ amount: "1000", transactionstatus: "success" }), null); // no reference we can match
assert.equal(parseCallback(null), null);
assert.equal(parseCallback("text"), null);
assert.equal(parseCallback([1, 2]), null);
assert.equal(normalizeStatus("Completed"), "success");
assert.equal(normalizeStatus("SUCCESS "), "success");
assert.equal(normalizeStatus(""), "unknown");
assert.equal(normalizeStatus(undefined), "unknown");
// payment state rules
assert.equal(nextStatus("pending", "success"), "success");
assert.equal(nextStatus("pending", "failed"), "failed");
assert.equal(nextStatus("pending", "expired"), "expired");
assert.equal(nextStatus("success", "failed"), "success"); // success can never be undone
assert.equal(nextStatus("success", "success"), "success"); // duplicate callback
assert.equal(nextStatus("failed", "success"), "failed");
assert.equal(nextStatus("expired", "success"), "success"); // late PIN entry: money moved
assert.equal(nextStatus("expired", "failed"), "expired");
assert.equal(becameSuccess("pending", "success"), true);
assert.equal(becameSuccess("expired", "success"), true);
assert.equal(becameSuccess("success", "success"), false); // second callback must not credit again
assert.equal(becameSuccess("pending", "failed"), false);
assert.equal(amountMatches(8000, 8000), true);
assert.equal(amountMatches(8000, "8000"), true);
assert.equal(amountMatches(8000, "8,000"), true);
assert.equal(amountMatches(8000, "8000.00"), true); // 8000.00 parses to the integer 8000
assert.equal(amountMatches(8000, "7999"), false);
assert.equal(amountMatches(8000, 8000.5), false);
assert.equal(amountMatches(8000, ""), false);
assert.equal(amountMatches(8000, null), false);
assert.equal(amountMatches(8000, "abc"), false);
assert.equal(shouldMarkOrderPaid("unpaid"), true);
assert.equal(shouldMarkOrderPaid("reported"), true);
assert.equal(shouldMarkOrderPaid("paid"), false);
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
