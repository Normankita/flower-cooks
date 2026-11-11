import CycleSwitcher from "@/components/CycleSwitcher";
import SubmitButton from "@/components/SubmitButton";
import { ORDER_SELECT, getOrders, getRecentCycles, selectCycle } from "@/lib/data";
import { displayPhone } from "@/lib/phone";
import { linesText } from "@/lib/summary";
import { db } from "@/lib/supabase";
import { tzs } from "@/lib/time";
import type { Order } from "@/lib/types";
import { setOrderStatus, setPayment } from "../../actions";

export default async function DeliveryPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const cycle = await selectCycle((await searchParams).c);
  if (!cycle) return <p className="card">Hakuna mzunguko.</p>;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const [orders, cycles, debtRes] = await Promise.all([
    getOrders(cycle.id),
    getRecentCycles(),
    db().from("orders").select(ORDER_SELECT).eq("status", "delivered").neq("payment_status", "paid"),
  ]);

  const route = orders.filter((o) => o.status === "confirmed" || o.status === "delivered");
  const groups = new Map<string, Order[]>();
  for (const o of route) {
    const k = o.offices?.name ?? "Bila eneo";
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const toCollect = route.filter((o) => o.payment_status !== "paid").reduce((s, o) => s + o.total, 0);

  // Debts across all cycles, grouped by customer
  const debts = new Map<string, { name: string; phone: string; total: number; n: number }>();
  for (const o of (debtRes.data as unknown as Order[]) ?? []) {
    if (!o.customers) continue;
    const d = debts.get(o.customers.id) ?? { name: o.customers.name, phone: o.customers.phone, total: 0, n: 0 };
    d.total += o.total;
    d.n += 1;
    debts.set(o.customers.id, d);
  }
  const debtList = [...debts.values()].sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-5">
      <CycleSwitcher cycles={cycles} current={cycle.id} />
      <div className="card flex justify-between">
        <span>Kusanya leo (ambazo hazijalipwa)</span>
        <b>{tzs(toCollect)}</b>
      </div>

      {[...groups.entries()].map(([office, list]) => (
        <section key={office} className="space-y-2">
          <h2 className="font-semibold text-orange-800">📍 {office} ({list.length})</h2>
          {list.map((o) => {
            const done = o.status === "delivered";
            const reviewMsg = `Asante kwa kuagiza biriani! 🍛 Ilikuwaje? Tupe maoni yako (sekunde 10): ${site}/r/${o.review_token}`;
            return (
              <div key={o.id} className={`card space-y-2 ${done && o.payment_status === "paid" ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{o.customers?.name}</div>
                    <a className="text-sm text-orange-700 underline" href={`tel:+${o.customers?.phone}`}>{displayPhone(o.customers?.phone ?? "")}</a>
                    {o.delivery_note && <div className="text-sm text-stone-600">{o.delivery_note}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-sm">{linesText(o)}</div>
                    {o.payment_status === "paid" ? (
                      <span className="badge bg-green-100 text-green-800">Imelipwa</span>
                    ) : (
                      <div className="font-bold text-red-700">Kusanya {tzs(o.total)}</div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!done && (
                    <form action={setOrderStatus}>
                      <input type="hidden" name="order_id" value={o.id} />
                      <input type="hidden" name="status" value="delivered" />
                      <SubmitButton className="btn-green">Imeletwa</SubmitButton>
                    </form>
                  )}
                  {o.payment_status !== "paid" && (
                    <form action={setPayment}>
                      <input type="hidden" name="order_id" value={o.id} />
                      <input type="hidden" name="paid" value="1" />
                      <SubmitButton className="btn-green">Amelipa ✓</SubmitButton>
                    </form>
                  )}
                  {done && (
                    <a className="btn-ghost btn-sm" target="_blank" href={`https://wa.me/${o.customers?.phone}?text=${encodeURIComponent(reviewMsg)}`}>
                      Omba maoni (WhatsApp)
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ))}
      {route.length === 0 && <p className="text-sm text-stone-500">Hakuna oda za kuleta bado.</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">🧾 Madeni (yote, mizunguko yote)</h2>
        {debtList.length === 0 && <p className="text-sm text-stone-500">Hakuna deni 🎉</p>}
        {debtList.map((d) => {
          const msg = `Habari ${d.name.split(" ")[0]}, kumbusho dogo la malipo ya biriani: ${tzs(d.total)}. Asante! 🙏`;
          return (
            <div key={d.phone} className="card flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{d.name}</div>
                <div className="text-sm text-stone-600">Oda {d.n} · {displayPhone(d.phone)}</div>
              </div>
              <div className="flex items-center gap-2">
                <b className="text-red-700">{tzs(d.total)}</b>
                <a className="btn-green" target="_blank" href={`https://wa.me/${d.phone}?text=${encodeURIComponent(msg)}`}>Kumbusha</a>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
