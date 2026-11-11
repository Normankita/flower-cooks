import Link from "next/link";
import OrderForm from "@/components/OrderForm";
import { cycleMode, getCurrentCycle, getMenu, getOffices, portionsTaken } from "@/lib/data";
import { fill, getLang, strings } from "@/lib/i18n";
import { fmtDateTime } from "@/lib/time";
import { placeOrder } from "./actions";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = getLang((await searchParams).lang);
  const t = strings(lang);
  const brand = process.env.NEXT_PUBLIC_BRAND ?? t.brand;

  const cycle = await getCurrentCycle();
  const mode = cycleMode(cycle);
  const [items, offices, taken] = await Promise.all([
    getMenu(),
    getOffices(),
    cycle ? portionsTaken(cycle.id) : Promise.resolve(0),
  ]);
  const left = cycle ? Math.max(cycle.capacity - taken, 0) : 0;
  const soldOut = mode === "open" && left === 0;
  const other = lang === "sw" ? "en" : "sw";

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 py-6">
      <header className="space-y-1">
        <div className="flex items-start justify-between">
          <h1 className="text-3xl font-extrabold text-orange-800">🍛 {brand}</h1>
          <Link href={`/?lang=${other}`} className="rounded-full border px-3 py-1 text-sm">
            {other.toUpperCase()}
          </Link>
        </div>
        <p className="text-stone-600">{t.tagline}</p>
      </header>

      {cycle && (mode === "open" || mode === "late") && (
        <div className="card flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div><span className="text-stone-500">{t.closesAt}:</span> <b>{fmtDateTime(cycle.closes_at, lang)}</b></div>
          <div><span className="text-stone-500">{t.deliveryAt}:</span> <b>{fmtDateTime(cycle.delivery_at, lang)}</b></div>
          {mode === "open" && !soldOut && left <= 15 && (
            <div className="font-semibold text-orange-700">{fill(t.left, { n: left })}</div>
          )}
        </div>
      )}

      {(mode === "none" || mode === "not_yet") && <p className="card">{t.noCycle}</p>}
      {mode === "closed" && <p className="card">{t.manuallyClosed}</p>}
      {soldOut && <p className="card font-medium">{t.soldOut}</p>}

      {cycle && mode === "late" && (
        <div className="card border-orange-200 bg-orange-50">
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
        />
      )}
    </main>
  );
}
