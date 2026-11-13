import Link from "next/link";
import CycleSwitcher from "@/components/CycleSwitcher";
import SubmitButton from "@/components/SubmitButton";
import ToastForm from "@/components/ToastForm";
import { getOrders, getRecentCycles, selectCycle } from "@/lib/data";
import { displayPhone } from "@/lib/phone";
import HomeStop from "@/components/HomeStop";
import SmsReconcile from "@/components/SmsReconcile";
import type { LatLng } from "@/lib/geo";
import { linesText, placeName } from "@/lib/summary";
import { tzs } from "@/lib/time";
import type { Order } from "@/lib/types";
import { setOrderStatus, setPayment } from "../../actions";

const statusBadge: Record<string, [string, string]> = {
  confirmed: ["Imekubaliwa", "bg-blue-100 text-blue-800"],
  late_request: ["Ombi la ziada", "bg-orange-100 text-orange-800"],
  declined: ["Imekataliwa", "bg-stone-200 text-stone-700"],
  cancelled: ["Imeghairiwa", "bg-stone-200 text-stone-700"],
  delivered: ["Imeletwa", "bg-green-100 text-green-800"],
};
const payBadge: Record<string, [string, string]> = {
  unpaid: ["Haijalipwa", "bg-red-100 text-red-800"],
  reported: ["Muamala umetajwa", "bg-amber-100 text-amber-800"],
  paid: ["Imelipwa", "bg-green-100 text-green-800"],
};

const statusToast: Record<string, string> = {
  confirmed: "Oda imekubaliwa ✓",
  declined: "Oda imekataliwa",
  delivered: "Imewekwa kuwa imeletwa ✓",
  cancelled: "Oda imeghairiwa",
};

function StatusBtn({ id, status, label, cls }: { id: string; status: string; label: string; cls: string }) {
  return (
    <ToastForm action={setOrderStatus} success={statusToast[status]}>
      <input type="hidden" name="order_id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton className={cls}>{label}</SubmitButton>
    </ToastForm>
  );
}

function Row({ o, kitchen }: { o: Order; kitchen: LatLng | null }) {
  const [sl, sc] = statusBadge[o.status];
  const [pl, pc] = payBadge[o.payment_status];
  const dead = o.status === "declined" || o.status === "cancelled";
  return (
    <div className={`card space-y-2 ${dead ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{o.customers?.name}</div>
          <a className="text-sm text-orange-700 underline" href={`tel:+${o.customers?.phone}`}>{displayPhone(o.customers?.phone ?? "")}</a>
          <div className="text-sm text-stone-600">{placeName(o)}{o.delivery_note ? ` · ${o.delivery_note}` : ""}</div>
        </div>
        <div className="text-right">
          <div className="font-bold">{tzs(o.total)}</div>
          <span className={`badge ${sc}`}>{sl}</span>
        </div>
      </div>
      <div className="text-sm">{linesText(o)}</div>
      {o.delivery_type === "home" && !dead && <HomeStop o={o} kitchen={kitchen} />}
      {o.notes &&<div className="text-sm italic text-stone-600">“{o.notes}”</div>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`badge ${pc}`}>{pl}</span>
        <span className="text-stone-500">{o.payment_method === "lipa" ? "Lipa Namba" : "Cash"}</span>
        {o.payment_ref && <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs">{o.payment_ref}</span>}
      </div>
      {!dead && (
        <div className="flex flex-wrap gap-2 pt-1">
          {o.status === "late_request" && (
            <>
              <StatusBtn id={o.id} status="confirmed" label="Kubali" cls="btn-green" />
              <StatusBtn id={o.id} status="declined" label="Kataa" cls="btn-red" />
            </>
          )}
          {o.status === "confirmed" && <StatusBtn id={o.id} status="delivered" label="Imeletwa" cls="btn-green" />}
          {o.status !== "late_request" && (
            <ToastForm action={setPayment} success={o.payment_status === "paid" ? "Malipo yametenguliwa" : "Malipo yamehifadhiwa ✓"} className="flex gap-2">
              <input type="hidden" name="order_id" value={o.id} />
              {o.payment_status === "paid" ? (
                <SubmitButton className="btn-red">Tengua malipo</SubmitButton>
              ) : (
                <>
                  <input type="hidden" name="paid" value="1" />
                  <SubmitButton className="btn-green">Amelipa ✓</SubmitButton>
                </>
              )}
            </ToastForm>
          )}
          {o.status === "confirmed" && <StatusBtn id={o.id} status="cancelled" label="Ghairi" cls="btn-red" />}
        </div>
      )}
    </div>
  );
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const cycle = await selectCycle((await searchParams).c);
  if (!cycle) return <p className="card">Hakuna mzunguko.</p>;
  const [orders, cycles] = await Promise.all([getOrders(cycle.id), getRecentCycles()]);
  const kitchen: LatLng | null =
    cycle.kitchen_lat != null && cycle.kitchen_lng != null ? { lat: Number(cycle.kitchen_lat), lng: Number(cycle.kitchen_lng) } : null;
  const late = orders.filter((o) => o.status === "late_request");
  const rest = orders.filter((o) => o.status !== "late_request");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CycleSwitcher cycles={cycles} current={cycle.id} />
        <Link href="/admin/orders/new" className="btn btn-sm">+ Weka oda (simu/WhatsApp)</Link>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-stone-500">Pakua (CSV/Excel):</span>
        <a href={`/admin/export/orders?c=${cycle.id}`} download className="btn-ghost btn-sm">⬇️ Mzunguko huu</a>
        <a href="/admin/export/orders" download className="btn-ghost btn-sm">⬇️ Oda zote</a>
      </div>
      <SmsReconcile waiting={orders.filter((o) => o.payment_status === "reported" && (o.status === "confirmed" || o.status === "delivered")).length} />
      {late.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-orange-800">Maombi ya ziada ({late.length})</h2>
          {late.map((o) => <Row key={o.id} o={o} kitchen={kitchen} />)}
        </section>
      )}
      <section className="space-y-2">
        <h2 className="font-semibold">Oda ({rest.length})</h2>
        {rest.length === 0 && <p className="text-sm text-stone-500">Hakuna oda bado.</p>}
        {rest.map((o) => <Row key={o.id} o={o} kitchen={kitchen} />)}
      </section>
    </div>
  );
}
