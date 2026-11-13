// Match pasted mobile-money confirmation SMS messages against orders whose customers reported a transaction ID.
// Pure, no imports. The SMS formats of the networks were NOT available while writing this, so the matching is
// deliberately conservative and the cook always reviews the result before confirming anything.

export type SmsOrder = { id: string; name: string; phone: string; total: number; ref: string };

export type SmsStatus =
  | "ready" //     reference found in a message AND that message shows the right received amount
  | "check" //     reference found, but the amount was not seen / is different: the cook must look
  | "duplicate" // the same reference is on several orders, or was already used on a paid order: never auto-ready
  | "missing"; //  reference not found in the pasted text

export type SmsMatch = {
  orderId: string;
  ref: string;
  status: SmsStatus;
  /** the message the reference was found in (trimmed), for the cook to read */
  snippet: string | null;
  /** amounts that look like money RECEIVED in that message (balances are ignored) */
  amounts: number[];
  /** the customer's phone number appears in that message (extra signal, not required) */
  phoneSeen: boolean;
};

/** Upper-case, no spaces. Customers type refs with odd spacing/case. */
export const normalizeRef = (r: string) => r.replace(/\s+/g, "").toUpperCase();

const BALANCE_RE = /(?:new\s+)?(?:(?:m-?pesa|airtel\s*money|tigo\s*pesa|halo\s*pesa|mixx[^0-9]{0,10})\s+)?(?:balance|salio)[^0-9]{0,40}(?:tsh|tzs|sh)?s?\.?\s*[\d][\d,]*(?:\.\d+)?/gi;
const MONEY_RE = /(?:(?:tsh|tzs|sh)s?\.?\s*(\d[\d,]*(?:\.\d{1,2})?))|(?:(\d[\d,]*(?:\.\d{1,2})?)\s*(?:tsh|tzs|\/=))/gi;
const RECEIVED_RE = /(received|umepokea|umepokelewa|imepokelewa|credited|amepokea|you have been paid|payment from|malipo kutoka)/i;

/** Money amounts in a message, with balances removed; if a "received" cue exists, only the first amount after it. */
export function receivedAmounts(msg: string): number[] {
  const cleaned = msg.replace(BALANCE_RE, " ");
  const cue = RECEIVED_RE.exec(cleaned);
  const scope = cue ? cleaned.slice(cue.index) : cleaned;
  const out: number[] = [];
  for (const m of scope.matchAll(MONEY_RE)) {
    const n = Number((m[1] ?? m[2]).replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) out.push(n);
    if (cue && out.length === 1) break; // with a "received" cue, the first amount after it is the payment
  }
  return out;
}

/** Split pasted text into messages: blank lines separate them; a huge run-together block is cut around the match. */
function messageAround(text: string, index: number): string {
  let start = 0;
  for (const m of text.matchAll(/\n\s*\n+/g)) {
    const end = m.index ?? 0;
    if (end >= index) return trim(text.slice(start, end), index - start);
    start = end + m[0].length;
  }
  return trim(text.slice(start), index - start);
}
function trim(block: string, rel: number): string {
  if (block.length <= 600) return block.trim();
  const from = Math.max(0, rel - 250);
  return block.slice(from, from + 600).trim();
}

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * @param usedRefs references (normalised) already attached to PAID orders — a reused receipt must not pay again
 */
export function matchSms(text: string, orders: SmsOrder[], usedRefs: Set<string> = new Set()): SmsMatch[] {
  const upper = text.toUpperCase();
  const counts = new Map<string, number>();
  for (const o of orders) counts.set(normalizeRef(o.ref), (counts.get(normalizeRef(o.ref)) ?? 0) + 1);

  return orders.map((o) => {
    const ref = normalizeRef(o.ref);
    const base: SmsMatch = { orderId: o.id, ref, status: "missing", snippet: null, amounts: [], phoneSeen: false };
    if (ref.length < 6) return base; // too short to be a trustworthy reference
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![A-Z0-9])${escaped}(?![A-Z0-9])`, "g");

    let best: SmsMatch | null = null;
    for (const hit of upper.matchAll(re)) {
      const msg = messageAround(text, hit.index ?? 0);
      const amounts = receivedAmounts(msg);
      const phoneTail = digits(o.phone).slice(-9);
      const found: SmsMatch = {
        orderId: o.id,
        ref,
        status: amounts.includes(o.total) ? "ready" : "check",
        snippet: msg,
        amounts,
        phoneSeen: phoneTail.length === 9 && digits(msg).includes(phoneTail),
      };
      if (!best || (best.status !== "ready" && found.status === "ready")) best = found; // prefer a message with the right amount
    }
    if (!best) return base;
    if ((counts.get(ref) ?? 0) > 1 || usedRefs.has(ref)) return { ...best, status: "duplicate" };
    return best;
  });
}
