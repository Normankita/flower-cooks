import type { Order } from "./types";

export type ItemAgg = { name: string; qty: number; rice: number; protein: number };

export function summarize(orders: Order[]) {
  const active = orders.filter((o) => o.status === "confirmed" || o.status === "delivered");
  const items = new Map<string, ItemAgg>();
  let portions = 0;
  for (const o of active) {
    for (const l of o.order_lines) {
      const a = items.get(l.item_id) ?? { name: l.menu_items?.name ?? "?", qty: 0, rice: 0, protein: 0 };
      a.qty += l.qty;
      a.rice += l.qty * Number(l.menu_items?.rice_kg ?? 0);
      a.protein += l.qty * Number(l.menu_items?.protein_kg ?? 0);
      items.set(l.item_id, a);
      portions += l.qty;
    }
  }
  const sum = (f: (o: Order) => boolean) => active.filter(f).reduce((s, o) => s + o.total, 0);
  return {
    items: [...items.values()],
    portions,
    rice: [...items.values()].reduce((s, i) => s + i.rice, 0),
    protein: [...items.values()].reduce((s, i) => s + i.protein, 0),
    revenue: sum(() => true),
    paid: sum((o) => o.payment_status === "paid"),
    reported: sum((o) => o.payment_status === "reported"),
    unpaid: sum((o) => o.payment_status === "unpaid"),
    customers: new Set(active.map((o) => o.customers?.id)).size,
    lateCount: orders.filter((o) => o.status === "late_request").length,
  };
}

/** Where the order goes, for admin lists: the office name, or "Nyumbani" for home deliveries. */
export const placeName = (o: Order) => (o.delivery_type === "home" ? "🏠 Nyumbani" : o.offices?.name ?? "");

export const linesText =(o: Order) =>
  o.order_lines.map((l) => `${l.qty}× ${l.menu_items?.name ?? "?"}`).join(", ");
