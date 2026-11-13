import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";
import ToastForm from "@/components/ToastForm";
import { getCurrentCycle, getMenu } from "@/lib/data";
import { getLang, strings } from "@/lib/i18n";
import { priceStanding } from "@/lib/standing";
import { getStandingByToken, weekState } from "@/lib/standing-db";
import { tzs } from "@/lib/time";
import { standingSetActive, standingSkip, standingUnskip } from "@/app/actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Private page for a customer's weekly order (the long random token in the address is the only credential). */
export default async function StandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { token } = await params;
  const lang = getLang((await searchParams).lang);
  const t = strings(lang);
  const s = await getStandingByToken(token);
  if (!s) return <main className="p-6">{t.notFound}</main>;

  const [menu, cycle] = await Promise.all([getMenu(false), getCurrentCycle()]);
  const name = new Map(menu.map((m) => [m.id, m.name]));
  const priced = priceStanding(s.lines, menu);
  const availableIds = new Set(priced.lines.map((l) => l.item_id));
  const week = await weekState(s, cycle);

  const hidden = (
    <>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="lang" value={lang} />
    </>
  );

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold text-orange-800">🔁 {t.stPageTitle}</h1>
        <p className="text-stone-600">{s.customers?.name.split(" ")[0]} · {s.offices?.name}</p>
      </div>

      <section className="card space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t.stItems}</h2>
          <span className={`badge ${s.active ? "bg-green-100 text-green-800" : "bg-stone-200 text-stone-700"}`}>{s.active ? t.stActive : t.stPaused}</span>
        </div>
        {s.lines.map((l) => (
          <div key={l.item_id} className={`flex justify-between ${availableIds.has(l.item_id) ? "" : "text-stone-400 line-through"}`}>
            <span>{l.qty} × {name.get(l.item_id) ?? "?"}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-stone-300/50 pt-2 font-bold">
          <span>{t.stTotalNow}</span>
          <span>{tzs(priced.total)}</span>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">{t.stThisWeek}</h2>
        {!s.active ? (
          <p className="text-stone-600">{t.standingPaused}</p>
        ) : week.state === "closed" ? (
          <p className="text-stone-600">{t.stClosed}</p>
        ) : week.state === "skipped" ? (
          <>
            <p className="font-medium">{t.stSkipped}</p>
            <ToastForm action={standingUnskip} success={t.stPlacedToast} errorText={t.errToast}>
              {hidden}
              <SubmitButton className="btn">{t.stUnskip}</SubmitButton>
            </ToastForm>
          </>
        ) : week.state === "ordered" ? (
          <>
            <p className="font-medium text-green-700">{t.stOrdered} ({tzs(week.total)})</p>
            <div className="flex flex-wrap gap-2">
              <Link href={`/order/${week.orderId}?lang=${lang}`} className="btn-ghost">{t.stViewOrder}</Link>
              {!week.paid && (
                <ToastForm action={standingSkip} success={t.stSkipToast} errorText={t.errToast}>
                  {hidden}
                  <SubmitButton className="btn-red">{t.stSkip}</SubmitButton>
                </ToastForm>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-stone-600">{t.stMissing}</p>
            <ToastForm action={standingUnskip} success={t.stPlacedToast} errorText={t.errToast}>
              {hidden}
              <SubmitButton className="btn">{t.stPlace}</SubmitButton>
            </ToastForm>
          </>
        )}
      </section>

      <ToastForm action={standingSetActive} success={s.active ? t.stPausedToast : t.stResumedToast} errorText={t.errToast}>
        {hidden}
        <input type="hidden" name="active" value={s.active ? "0" : "1"} />
        <SubmitButton className="btn-ghost w-full">{s.active ? t.stPause : t.stResume}</SubmitButton>
      </ToastForm>
    </main>
  );
}
