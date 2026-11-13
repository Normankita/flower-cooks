import Link from "next/link";
import PayByPhone from "@/components/PayByPhone";
import SubmitButton from "@/components/SubmitButton";
import StaffLink from "@/components/StaffLink";
import SuccessMark from "@/components/SuccessMark";
import ToastForm from "@/components/ToastForm";
import { azampayConfigured } from "@/lib/azampay";
import { getCycle, getOrder } from "@/lib/data";
import { fill, getLang, strings } from "@/lib/i18n";
import { detectNetwork } from "@/lib/mobile-network";
import { activePending, ageMs, getOrderPayments } from "@/lib/payments-db";
import { displayPhone } from "@/lib/phone";
import { tzs } from "@/lib/time";
import { cancelOrder, reportPayment } from "@/app/actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // the pay-by-phone action waits on AzamPay, which can take ~30 s

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

  // Pay-by-phone (AzamPay): offered when configured. If the payments table can't be read we simply fall back to the
  // manual Lipa Namba flow instead of breaking the page.
  let payByPhone = false;
  let waitingAgeMs: number | null = null;
  let lastStatus: "failed" | "expired" | null = null;
  if (showPay && azampayConfigured()) {
    try {
      const pays = await getOrderPayments(order.id);
      payByPhone = true;
      const active = activePending(pays);
      if (active) waitingAgeMs = ageMs(active);
      else if (pays[0]) lastStatus = pays[0].status === "failed" ? "failed" : pays[0].status === "success" ? null : "expired";
    } catch (e) {
      console.error("order page: payments unavailable, using manual flow:", e instanceof Error ? e.message : e);
    }
  }

  const banner =
    order.status === "late_request" ? t.lateReceived
    : order.status === "declined" ? t.declined
    : order.status === "cancelled" ? t.cancelled
    : order.status === "delivered" ? t.delivered
    : t.orderReceived;
  const good = order.status === "confirmed" || order.status === "delivered" || order.status === "late_request";

  const hidden = (
    <>
      <input type="hidden" name="order_id" value={order.id} />
      <input type="hidden" name="lang" value={lang} />
    </>
  );

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        {good && <SuccessMark />}
        <h1 className="text-2xl font-extrabold text-orange-800">
          {fill(t.thanks, { name: order.customers?.name.split(" ")[0] ?? "" })}
        </h1>
        <p className="text-stone-700">{banner}</p>
      </div>

      <section className="card space-y-2">
        <h2 className="font-semibold">{t.yourOrder}</h2>
        {order.order_lines.map((l) => (
          <div key={l.id} className="flex justify-between">
            <span>{l.qty} × {l.menu_items?.name}</span>
            <span>{tzs(l.qty * l.unit_price)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-stone-300/50 pt-2 text-lg font-bold">
          <span>{t.total}</span>
          <span>{tzs(order.total)}</span>
        </div>
        <div className="text-sm text-stone-600">
          {order.delivery_type === "home" ? `🏠 ${t.homeOption}` : `📍 ${order.offices?.name ?? ""}`}
          {order.delivery_note ? ` · ${order.delivery_note}` : ""}
        </div>
      </section>

      {order.payment_status === "paid" && (
        <p className="card font-semibold text-green-700">{t.paid}</p>
      )}

      {showPay && (
        <section className="card space-y-3">
          <h2 className="font-semibold">{t.payNow}</h2>
          {payByPhone && (
            <PayByPhone
              orderId={order.id}
              lang={lang}
              t={t}
              total={order.total}
              defaultPhone={displayPhone(order.customers?.phone ?? "")}
              defaultNetwork={detectNetwork(order.customers?.phone ?? "")}
              waitingAgeMs={waitingAgeMs}
              lastStatus={lastStatus}
            />
          )}
          {cycle?.lipa_namba ? (
            <>
              {payByPhone && <div className="border-t border-stone-300/50 pt-3 text-sm font-medium">{t.payOr}</div>}
              <p className="text-sm text-stone-600">{t.payLipaHow}</p>
              <div className="rounded-2xl bg-linear-to-br from-orange-100/90 to-amber-100/80 p-4 text-center shadow-inner">
                <div className="text-sm text-stone-600">{t.lipaNumber}</div>
                <div className="text-3xl font-extrabold tracking-widest">{cycle.lipa_namba}</div>
                <div className="text-sm text-stone-600">{t.amount}: <b>{tzs(order.total)}</b></div>
              </div>
              {order.payment_status === "reported" ? (
                <p className="text-sm text-green-700">{t.payRefSaved} ({order.payment_ref})</p>
              ) : (
                <ToastForm action={reportPayment} success={t.payRefSaved} errorText={t.errToast} className="flex gap-2">
                  {hidden}
                  <input name="ref" className="input" placeholder={t.payRefLabel} maxLength={40} required />
                  <SubmitButton className="btn">{t.payRefSave}</SubmitButton>
                </ToastForm>
              )}
            </>
          ) : (
            !payByPhone && <p className="text-sm text-stone-600">{t.payLater}</p>
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
        <ToastForm action={cancelOrder} success={t.cancelled} errorText={t.errToast}>
          {hidden}
          <SubmitButton className="btn-red">{t.cancelOrder}</SubmitButton>
        </ToastForm>
      )}
      <StaffLink label={t.staffLink} />
    </main>
  );
}
