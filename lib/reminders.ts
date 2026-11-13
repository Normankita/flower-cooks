// Reminder rules: message texts, SMS length, who is eligible, and when. Pure, no imports.

export type Kind = "wed" | "thu" | "fri";

export type Cust = { id: string; name: string; phone: string; unsub_token: string };
export type OrderLite = { customer_id: string; status: string };

const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";

/** SMS segments a text will cost: GSM-7 is 160 (153 when split); anything else (emoji, curly quotes) is UCS-2: 70 (67). */
export function smsSegments(text: string): { segments: number; encoding: "GSM-7" | "UCS-2"; length: number } {
  let units = 0;
  let gsm = true;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) units += 1;
    else if (GSM_EXT.includes(ch)) units += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) return { segments: units <= 160 ? 1 : Math.ceil(units / 153), encoding: "GSM-7", length: units };
  const len = [...text].length; // UCS-2 counts UTF-16 units; close enough for a cost estimate
  return { segments: len <= 70 ? 1 : Math.ceil(len / 67), encoding: "UCS-2", length: len };
}

/** Wednesday/Thursday reminder and Friday "on our way" texts (Kiswahili, plain ASCII so each costs the fewest segments). */
export function buildMessage(kind: Kind, o: { brand: string; site: string; closes: string; unsubUrl?: string }): string {
  const stop = o.unsubUrl ? `\nKujiondoa: ${o.unsubUrl}` : "";
  const order = o.site ? ` Agiza: ${o.site}` : "";
  switch (kind) {
    case "wed":
      return `${o.brand}: Oda za biriani ya Ijumaa zinapokelewa hadi ${o.closes}.${order}${stop}`;
    case "thu":
      return `${o.brand}: Leo ndio mwisho! Oda zinafungwa ${o.closes}.${order}${stop}`;
    case "fri":
      return `${o.brand}: Tunakuja na biriani yako sasa hivi. Tafadhali uwe tayari kupokea. Asante!${stop}`;
  }
}

/** East Africa Time weekday of an instant (0 = Sunday … 6 = Saturday). EAT is UTC+3 all year. */
export const eatWeekday = (now: number | Date = Date.now()) => new Date(new Date(now).getTime() + 3 * 3600_000).getUTCDay();

/** wed → 3, thu → 4. Friday's message is sent by the cook's button, so it has no fixed weekday. */
export const KIND_WEEKDAY: Partial<Record<Kind, number>> = { wed: 3, thu: 4 };

const ACTIVE = new Set(["confirmed", "late_request", "delivered"]);

/**
 * Who should get this reminder.
 * - everyone must have opted in (explicit consent), and must not have received this reminder for this cycle already;
 * - wed/thu: customers WITHOUT an active order in the cycle (past customers who haven't ordered this week);
 * - fri ("on our way"): customers with a confirmed order still to be delivered.
 */
export function audience(
  kind: Kind,
  optedIn: Cust[],
  cycleOrders: OrderLite[],
  alreadyLogged: Set<string>,
): Cust[] {
  const active = new Set(cycleOrders.filter((o) => ACTIVE.has(o.status)).map((o) => o.customer_id));
  const toDeliver = new Set(cycleOrders.filter((o) => o.status === "confirmed").map((o) => o.customer_id));
  return optedIn.filter((c) => {
    if (alreadyLogged.has(c.id)) return false;
    return kind === "fri" ? toDeliver.has(c.id) : !active.has(c.id);
  });
}

/** Cron guard: the scheduled job only sends on its own weekday (EAT); `force` is for the cook's manual button. */
export function dayAllows(kind: Kind, now: number | Date, force: boolean): boolean {
  if (force) return true;
  const want = KIND_WEEKDAY[kind];
  return want === undefined || eatWeekday(now) === want;
}
