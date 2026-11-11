import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";
import { getCycle, getOrder } from "@/lib/data";
import { fill, getLang, strings } from "@/lib/i18n";
import { tzs } from "@/lib/time";
import { cancelOrder, reportPayment } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { id } = await params;
  const lang = getLang((await searchParams).lang);
  const t = strings(lang);
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  const order = isUuid ? await getOrder(id) : null;
  if (!order) return <main className="p-6">{t.notFound}</main>;

  const cycle = await getCycle(order.cycle_id);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const wa = process.env.NEXT_PUBLIC_WHATSAPP; // e.g. 255712345678
  const beforeCutoff = cycle ? new Date() < new Date(cycle.closes_at) : false;
  const canCancel =
    beforeCutoff && (order.status === "confirmed" || order.status === "late_request") && order.payment_status !== "paid";
  const showPay =
    order.payment_method === "lipa" &&
    (order.status === "confirmed" || order.status === "delivered") &&
    order.payment_status !== "paid";

  const banner =
    order.status === "late_request" ? t.lateReceived
    : order.status === "declined" ? t.declined
    : order.status === "cancelled" ? t.cancelled
    : order.status === "delivered" ? t.delivered
    : t.orderReceived;

  const hidden = (
    <>
      <input type="hidden" name="order_id" value={order.id} />
      <input type="hidden" name="lang" value={lang} />
    </>
  );

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <h1 className="text-2xl font-extrabold text-orange-800">
        {fill(t.thanks, { name: order.customers?.name.split(" ")[0] ?? "" })}
      </h1>
      <p className="card font-medium">{banner}</p>

      <section className="card space-y-2">
        <h2 className="font-semibold">{t.yourOrder}</h2>
        {order.order_lines.map((l) => (
          <div key={l.id} className="flex justify-between">
            <span>{l.qty} × {l.menu_items?.name}</span>
            <span>{tzs(l.qty * l.unit_price)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t pt-2 font-bold">
          <span>{t.total}</span>
          <span>{tzs(order.total)}</span>
        </div>
        <div className="text-sm text-stone-600">
          {order.offices?.name}
          {order.delivery_note ? ` · ${order.delivery_note}` : ""}
        </div>
      </section>

      {order.payment_status === "paid" && (
        <p className="card font-semibold text-green-700">{t.paid}</p>
      )}

      {showPay && (
        <section className="card space-y-3">
          <h2 className="font-semibold">{t.payNow}</h2>
          {cycle?.lipa_namba ? (
            <>
              <p className="text-sm text-stone-600">{t.payLipaHow}</p>
              <div className="rounded-xl bg-orange-50 p-3 text-center">
                <div className="text-sm text-stone-600">{t.lipaNumber}</div>
                <div className="text-3xl font-extrabold tracking-widest">{cycle.lipa_namba}</div>
                <div className="text-sm text-stone-600">{t.amount}: <b>{tzs(order.total)}</b></div>
              </div>
              {order.payment_status === "reported" ? (
                <p className="text-sm text-green-700">{t.payRefSaved} ({order.payment_ref})</p>
              ) : (
                <form action={reportPayment} className="flex gap-2">
                  {hidden}
                  <input name="ref" className="input" placeholder={t.payRefLabel} maxLength={40} required />
                  <SubmitButton className="btn">{t.payRefSave}</SubmitButton>
                </form>
              )}
            </>
          ) : (
            <p className="text-sm text-stone-600">{t.payLater}</p>
          )}
        </section>
      )}
      {order.payment_method === "cash" && order.payment_status !== "paid" && order.status === "confirmed" && (
        <p className="card text-sm text-stone-700">{t.payLater}</p>
      )}

      <section className="flex flex-wrap gap-2">
        <a
          className="btn-ghost"
          target="_blank"
          href={`https://wa.me/?text=${encodeURIComponent(fill(t.shareMsg, { url: site || "" }))}`}
        >
          {t.share}
        </a>
        {wa && (
          <a className="btn-ghost" target="_blank" href={`https://wa.me/${wa}`}>
            {t.contact}
          </a>
        )}
        <Link className="btn-ghost" href={`/?lang=${lang}`}>{t.another}</Link>
      </section>

      {canCancel && (
        <form action={cancelOrder}>
          {hidden}
          <SubmitButton className="btn-red">{t.cancelOrder}</SubmitButton>
        </form>
      )}
    </main>
  );
}
