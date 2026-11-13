"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { myOrders, type OrderBrief } from "@/app/actions";
import type { Dict } from "@/lib/i18n";
import { tzs } from "@/lib/time";

export const MY_ORDERS_KEY = "bo_orders";

/**
 * "Your order this week: pay now" for the phone that placed the order. The browser remembers the order ids of this
 * cycle (see OrderForm); their current status comes from the server. No phone-number lookup anywhere.
 */
export default function MyOrders({ cycleId, lang, t }: { cycleId: string; lang: string; t: Dict }) {
  const [rows, setRows] = useState<OrderBrief[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      let ids: string[] = [];
      try {
        const list = JSON.parse(localStorage.getItem(MY_ORDERS_KEY) ?? "[]") as { id: string; cycleId: string }[];
        ids = list.filter((x) => x.cycleId === cycleId).map((x) => x.id);
      } catch {}
      if (ids.length === 0) return;
      const r = await myOrders(ids);
      if (alive) setRows(r.filter((o) => o.status !== "cancelled" && o.status !== "declined"));
    })();
    return () => {
      alive = false;
    };
  }, [cycleId]);

  if (rows.length === 0) return null;

  return (
    <section className="card space-y-2">
      <h2 className="font-semibold">🧾 {t.myOrderTitle}</h2>
      {rows.map((o) => {
        const payable = o.payment_method === "lipa" && o.payment_status !== "paid" && (o.status === "confirmed" || o.status === "delivered");
        const state =
          o.payment_status === "paid" ? t.paid
          : o.payment_method === "cash" ? t.myOrderCash
          : o.payment_status === "reported" ? t.payRefSaved
          : t.myOrderUnpaid;
        return (
          <div key={o.id} className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">{tzs(o.total)}</div>
              <div className={`text-sm ${o.payment_status === "paid" ? "text-green-700" : "text-stone-600"}`}>{state}</div>
            </div>
            <Link href={`/order/${o.id}?lang=${lang}`} className={payable ? "btn btn-sm" : "btn-ghost btn-sm"}>
              {payable ? t.myOrderPay : t.myOrderView}
            </Link>
          </div>
        );
      })}
    </section>
  );
}
