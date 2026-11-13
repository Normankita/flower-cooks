import Link from "next/link";
import InstallPrompt from "@/components/InstallPrompt";
import MyOrders from "@/components/MyOrders";
import ReviewsCard from "@/components/ReviewsCard";
import StaffLink from "@/components/StaffLink";
import OrderForm from "@/components/OrderForm";
import ThemeSuggest from "@/components/ThemeSuggest";
import ThemeToggle from "@/components/ThemeToggle";
import { cycleMode, getCurrentCycle, getMenu, getOffices, homeStopsTaken, portionsTaken } from "@/lib/data";
import { fill, getLang, strings } from "@/lib/i18n";
import { smsConfigured } from "@/lib/sms";
import { fmtDateTime } from "@/lib/time";
import { placeOrder } from "./actions";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = getLang((await searchParams).lang);
  const t = strings(lang);
  const brand = process.env.NEXT_PUBLIC_BRAND ?? t.brand;

  const cycle = await getCurrentCycle();
  const mode = cycleMode(cycle);
  const [items, offices, taken, homeTaken] = await Promise.all([
    getMenu(),
    getOffices(),
    cycle ? portionsTaken(cycle.id) : Promise.resolve(0),
    cycle?.home_enabled && cycle.home_max_stops != null ? homeStopsTaken(cycle.id) : Promise.resolve(0),
  ]);
  const homeFull = !!cycle?.home_enabled && cycle.home_max_stops != null && homeTaken >= cycle.home_max_stops;
  const left = cycle ? Math.max(cycle.capacity - taken, 0) : 0;
  const soldOut = mode === "open" && left === 0;
  const other = lang === "sw" ? "en" : "sw";

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pb-8 pt-6">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="flex items-center gap-2.5 text-3xl font-extrabold leading-tight">
            <span className="float text-4xl" aria-hidden>🍛</span>
            <span className="bg-linear-to-r from-orange-700 via-red-600 to-amber-600 bg-clip-text text-transparent">{brand}</span>
          </h1>
          <div className="flex items-center gap-2">
            <ThemeToggle label={t.themeToggle} />
            <Link href={`/?lang=${other}`} className="glass rounded-full px-3.5 py-1.5 text-sm font-semibold text-stone-700 transition hover:scale-105 active:scale-95">
              {other.toUpperCase()}
            </Link>
          </div>
        </div>
        <p className="text-stone-600">{t.tagline}</p>
      </header>

      <InstallPrompt t={t} />
      <ThemeSuggest t={t} />

      {cycle && (mode === "open" || mode === "late") && (
        <div className="card grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-stone-500">⏰ {t.closesAt}</div>
            <b>{fmtDateTime(cycle.closes_at, lang)}</b>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-stone-500">🛵 {t.deliveryAt}</div>
            <b>{fmtDateTime(cycle.delivery_at, lang)}</b>
          </div>
          {mode === "open" && !soldOut && left <= 15 && (
            <div className="col-span-2 rounded-xl bg-orange-100/80 px-3 py-1.5 font-semibold text-orange-800">
              🔥 {fill(t.left, { n: left })}
            </div>
          )}
        </div>
      )}

      {cycle && <MyOrders cycleId={cycle.id} lang={lang} t={t} />}

      <ReviewsCard t={t} />

      {(mode === "none" || mode === "not_yet") && <p className="card">{t.noCycle}</p>}
      {mode === "closed" && <p className="card">{t.manuallyClosed}</p>}
      {soldOut && <p className="card font-medium">{t.soldOut}</p>}

      {cycle && mode === "late" && (
        <div className="card border-orange-200 bg-orange-50/80!">
          <h2 className="font-semibold">{t.lateTitle}</h2>
          <p className="text-sm text-stone-700">{t.lateBody}</p>
        </div>
      )}

      {cycle && ((mode === "open" && !soldOut) || mode === "late") && (
        <OrderForm
          action={placeOrder}
          cycleId={cycle.id}
          items={items.map(({ id, name, price }) => ({ id, name, price }))}
          offices={offices.map(({ id, name }) => ({ id, name }))}
          lang={lang}
          t={t}
          submitLabel={mode === "late" ? t.submitLate : t.submit}
          successText={mode === "late" ? t.lateSent : t.orderSent}
          homeEnabled={cycle.home_enabled}
          homeFull={homeFull}
          smsOptInOffered={smsConfigured()}
        />
      )}
      <StaffLink label={t.staffLink} />
    </main>
  );
}
