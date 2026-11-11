import { db } from "./supabase";
import { must } from "./data";
import { toCsv, type Cell } from "./csv";
import { toEATInput } from "./time";

export type ExportOrder = {
  id: string;
  status: string;
  payment_method: string;
  payment_status: string;
  payment_ref: string | null;
  total: number;
  notes: string | null;
  delivery_note: string | null;
  created_at: string;
  delivered_at: string | null;
  paid_at: string | null;
  cycles: { title: string; delivery_at: string } | null;
  customers: { name: string; phone: string } | null;
  offices: { name: string } | null;
  order_lines: { qty: number; unit_price: number; menu_items: { name: string } | null }[];
};

const SELECT =
  "id,status,payment_method,payment_status,payment_ref,total,notes,delivery_note,created_at,delivered_at,paid_at," +
  "cycles(title,delivery_at),customers(name,phone),offices(name)," +
  "order_lines(qty,unit_price,menu_items(name))";

const PAGE = 1000; // PostgREST returns at most 1000 rows per request, so page through

/** Orders for export, oldest first. cycleId limits to one cycle; debtsOnly = delivered but not fully paid (all cycles). */
export async function fetchOrdersForExport(opts: { cycleId?: string; debtsOnly?: boolean } = {}): Promise<ExportOrder[]> {
  const out: ExportOrder[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db()
      .from("orders")
      .select(SELECT)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (opts.cycleId) q = q.eq("cycle_id", opts.cycleId);
    if (opts.debtsOnly) q = q.eq("status", "delivered").neq("payment_status", "paid");
    const rows = (must(await q, "exportOrders") ?? []) as unknown as ExportOrder[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const STATUS: Record<string, string> = {
  confirmed: "Imekubaliwa",
  late_request: "Ombi la ziada",
  declined: "Imekataliwa",
  cancelled: "Imeghairiwa",
  delivered: "Imeletwa",
};
const PAY_STATUS: Record<string, string> = {
  unpaid: "Haijalipwa",
  reported: "Muamala umetajwa",
  paid: "Imelipwa",
};

/** EAT timestamp as "2026-11-13 13:00". */
const stamp = (iso: string | null) => (iso ? toEATInput(iso).replace("T", " ") : "");
/** 255712345678 → "0712 345 678": the space keeps Excel from turning it into a number (and dropping the 0). */
const phone = (p: string | undefined) => {
  if (!p) return "";
  const d = p.startsWith("255") ? "0" + p.slice(3) : p;
  return d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : d;
};
const items = (o: ExportOrder) => o.order_lines.map((l) => `${l.qty}× ${l.menu_items?.name ?? "?"}`).join(", ");
const portions = (o: ExportOrder) => o.order_lines.reduce((s, l) => s + l.qty, 0);

export function ordersCsv(orders: ExportOrder[]): string {
  const rows: Cell[][] = [
    [
      "Namba ya oda", "Mzunguko", "Tarehe ya kuleta", "Oda ilipowekwa", "Jina", "Simu", "Ofisi", "Maelezo ya kuleta",
      "Vyakula", "Idadi", "Jumla (TSh)", "Hali", "Njia ya malipo", "Hali ya malipo", "Namba ya muamala",
      "Imeletwa lini", "Imelipwa lini", "Maombi maalum",
    ],
  ];
  for (const o of orders) {
    rows.push([
      o.id,
      o.cycles?.title,
      stamp(o.cycles?.delivery_at ?? null),
      stamp(o.created_at),
      o.customers?.name,
      phone(o.customers?.phone),
      o.offices?.name,
      o.delivery_note,
      items(o),
      portions(o),
      o.total,
      STATUS[o.status] ?? o.status,
      o.payment_method === "lipa" ? "Lipa Namba" : "Cash",
      PAY_STATUS[o.payment_status] ?? o.payment_status,
      o.payment_ref,
      stamp(o.delivered_at),
      stamp(o.paid_at),
      o.notes,
    ]);
  }
  return toCsv(rows);
}

export function debtsCsv(orders: ExportOrder[]): string {
  const sorted = [...orders].sort(
    (a, b) =>
      (a.customers?.name ?? "").localeCompare(b.customers?.name ?? "") ||
      (a.delivered_at ?? a.created_at).localeCompare(b.delivered_at ?? b.created_at),
  );
  const rows: Cell[][] = [
    ["Jina", "Simu", "Ofisi", "Mzunguko", "Imeletwa lini", "Vyakula", "Deni (TSh)", "Hali ya malipo", "Namba ya muamala", "Namba ya oda"],
  ];
  for (const o of sorted) {
    rows.push([
      o.customers?.name,
      phone(o.customers?.phone),
      o.offices?.name,
      o.cycles?.title,
      stamp(o.delivered_at),
      items(o),
      o.total,
      PAY_STATUS[o.payment_status] ?? o.payment_status,
      o.payment_ref,
      o.id,
    ]);
  }
  return toCsv(rows);
}
