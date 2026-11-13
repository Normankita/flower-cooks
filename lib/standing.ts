// Pure rules for standing ("same every Friday") orders and for public review display. No imports.

export type StandingLine = { item_id: string; qty: number };
export type MenuLite = { id: string; price: number; active: boolean };

/**
 * Today's order lines for a standing order: current menu prices (a price change applies from the next cycle), items no
 * longer on the menu dropped. `dropped` tells the caller something was removed.
 */
export function priceStanding(lines: StandingLine[], menu: MenuLite[]) {
  const price = new Map(menu.filter((m) => m.active).map((m) => [m.id, m.price]));
  const out: { item_id: string; qty: number; unit_price: number }[] = [];
  let dropped = 0;
  for (const l of lines) {
    const p = price.get(l.item_id);
    const qty = Math.floor(Number(l.qty));
    if (p === undefined || !(qty > 0)) dropped++;
    else out.push({ item_id: l.item_id, qty: Math.min(qty, 20), unit_price: p });
  }
  return { lines: out, total: out.reduce((s, l) => s + l.qty * l.unit_price, 0), portions: out.reduce((s, l) => s + l.qty, 0), dropped };
}

/** Sanity-check a lines array coming from the database / an order. */
export function cleanLines(raw: unknown): StandingLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l) => ({ item_id: String((l as StandingLine)?.item_id ?? ""), qty: Math.floor(Number((l as StandingLine)?.qty)) }))
    .filter((l) => /^[0-9a-f-]{36}$/i.test(l.item_id) && l.qty > 0 && l.qty <= 20)
    .slice(0, 20);
}

/**
 * A comment is shown publicly only if it is short and contains no link and no phone number, so a review link can never
 * be used to advertise or leak numbers on the order page. Returns the cleaned text, or null when it must not be shown.
 */
export function publicComment(text: string | null | undefined): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length < 3) return null;
  if (/https?:|www\.|\.(com|co\.tz|tz|net|org)\b|@/i.test(t)) return null; // links / emails
  if (/\d[\d\s.-]{7,}\d/.test(t)) return null; // 9+ digits in a row = a phone number
  return t.length > 200 ? t.slice(0, 197).trimEnd() + "…" : t;
}

export type ReviewLite = { rating: number; comment: string | null; name: string; hidden: boolean; created_at: string };

/** Average over all visible ratings (honest) + up to `n` recent warm comments (4★+ only, safe text, first name only). */
export function reviewSummary(rows: ReviewLite[], n = 3) {
  const visible = rows.filter((r) => !r.hidden && r.rating >= 1 && r.rating <= 5);
  const count = visible.length;
  const avg = count ? Math.round((visible.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;
  const recent = visible
    .filter((r) => r.rating >= 4)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((r) => ({ text: publicComment(r.comment), name: r.name.trim().split(/\s+/)[0] ?? "", rating: r.rating }))
    .filter((r): r is { text: string; name: string; rating: number } => r.text !== null)
    .slice(0, n);
  return { count, avg, recent };
}
