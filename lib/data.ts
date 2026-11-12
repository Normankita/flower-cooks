import { db } from "./supabase";
import { DbUnavailableError, isNetworkMessage } from "./db-error";
import type { Cycle, MenuItem, Office, Order } from "./types";

export const ORDER_SELECT =
  "id,cycle_id,status,payment_method,payment_status,payment_ref,total,notes,delivery_note,review_token,delivered_at,created_at," +
  "delivery_type,delivery_lat,delivery_lng,location_url," +
  "customers(id,name,phone),offices(id,name)," +
  "order_lines(id,qty,unit_price,item_id,menu_items(name,rice_kg,protein_kg))";

/** Throw on a Supabase error instead of silently returning empty data (e.g. when the project is paused). */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T | null {
  if (res.error) {
    if (isNetworkMessage(res.error.message)) throw new DbUnavailableError(what, res.error.message);
    throw new Error(`Database error (${what}): ${res.error.message}`);
  }
  return res.data;
}

export async function getCurrentCycle(): Promise<Cycle | null> {
  const data = must(
    await db().from("cycles").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    "getCurrentCycle",
  );
  return (data as Cycle | null) ?? null;
}

export async function getRecentCycles(n = 10): Promise<Cycle[]> {
  const data = must(
    await db().from("cycles").select("*").order("created_at", { ascending: false }).limit(n),
    "getRecentCycles",
  );
  return (data as Cycle[]) ?? [];
}

export async function getCycle(id: string): Promise<Cycle | null> {
  const data = must(await db().from("cycles").select("*").eq("id", id).maybeSingle(), "getCycle");
  return (data as Cycle | null) ?? null;
}

export async function getMenu(onlyActive = true): Promise<MenuItem[]> {
  let q = db().from("menu_items").select("*").order("sort").order("name");
  if (onlyActive) q = q.eq("active", true);
  const data = must(await q, "getMenu");
  return (data as MenuItem[]) ?? [];
}

export async function getOffices(onlyActive = true): Promise<Office[]> {
  let q = db().from("offices").select("*").order("sort").order("name");
  if (onlyActive) q = q.eq("active", true);
  const data = must(await q, "getOffices");
  return (data as Office[]) ?? [];
}

export async function getOrders(cycleId: string): Promise<Order[]> {
  const data = must(
    await db().from("orders").select(ORDER_SELECT).eq("cycle_id", cycleId).order("created_at"),
    "getOrders",
  );
  return (data as unknown as Order[]) ?? [];
}

export async function getOrder(id: string): Promise<Order | null> {
  const data = must(await db().from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle(), "getOrder");
  return (data as unknown as Order) ?? null;
}

/** Portions already committed (confirmed + delivered) in a cycle. */
export async function portionsTaken(cycleId: string): Promise<number> {
  const data = must(
    await db()
      .from("orders")
      .select("status, order_lines(qty)")
      .eq("cycle_id", cycleId)
      .in("status", ["confirmed", "delivered"]),
    "portionsTaken",
  );
  type Row = { order_lines: { qty: number }[] };
  return ((data as unknown as Row[]) ?? []).reduce(
    (s, o) => s + o.order_lines.reduce((a, l) => a + l.qty, 0),
    0,
  );
}

/** Home deliveries already accepted (confirmed + delivered) in a cycle — each one is its own stop. */
export async function homeStopsTaken(cycleId: string): Promise<number> {
  const res = await db()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("cycle_id", cycleId)
    .eq("delivery_type", "home")
    .in("status", ["confirmed", "delivered"]);
  must(res, "homeStopsTaken");
  return res.count ?? 0;
}

export { cycleMode, type CycleMode } from "./cycle";

/** Admin: the cycle chosen via ?c=<id>, else the current (latest) one. */
export async function selectCycle(id?: string): Promise<Cycle | null> {
  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const c = await getCycle(id);
    if (c) return c;
  }
  return getCurrentCycle();
}
