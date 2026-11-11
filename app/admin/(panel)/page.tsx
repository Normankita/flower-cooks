import Link from "next/link";
import CopyButton from "@/components/CopyButton";
import CycleSwitcher from "@/components/CycleSwitcher";
import SubmitButton from "@/components/SubmitButton";
import { cycleMode, getMenu, getOrders, getRecentCycles, selectCycle } from "@/lib/data";
import { summarize } from "@/lib/summary";
import { fmtDateTime, tzs } from "@/lib/time";
import { createCycle, toggleCycle } from "../actions";

const modeLabel = { none: "—", not_yet: "Bado haijafunguliwa", open: "Inapokea oda", late: "Imepita muda (maombi ya ziada)", closed: "Imefungwa" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const cycle = await selectCycle((await searchParams).c);
  if (!cycle) {
    return (
      <div className="card space-y-3">
        <p>Hakuna mzunguko bado. Anza wa kwanza:</p>
        <form action={createCycle}><SubmitButton>Tengeneza mzunguko wa Ijumaa</SubmitButton></form>
      </div>
    );
  }
  const [orders, cycles, menu] = await Promise.all([getOrders(cycle.id), getRecentCycles(), getMenu()]);
  const s = summarize(orders);
  const mode = cycleMode(cycle);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const closes = fmtDateTime(cycle.closes_at);
  const menuText = menu.map((m) => `${m.name} — TSh ${m.price.toLocaleString("en-US")}`).join("\n");

  const messages = [
    {
      title: "Ufunguzi wa oda (Jumamosi)",
      text: `🍛 Habari! Oda za Biriani ya Ijumaa zimefunguliwa.\n\n${menuText}\n\nOda hadi ${closes}. Tunaleta Ijumaa mchana.\nOda hapa: ${site}`,
    },
    {
      title: "Kumbusho (Jumatano)",
      text: `⏰ Kumbusho: oda za Biriani ya Ijumaa zinafungwa ${closes}.\nUsipitwe 🍛 ${site}`,
    },
    {
      title: "Nafasi ya mwisho (Alhamisi)",
      text: `🔔 Leo ndiyo mwisho! Oda za biriani zinafungwa saa 20:00 usiku.\nOda sasa: ${site}`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CycleSwitcher cycles={cycles} current={cycle.id} />
        <form action={createCycle}><SubmitButton className="btn-ghost btn-sm">+ Mzunguko mpya</SubmitButton></form>
      </div>

      <section className="card space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{cycle.title}</h1>
            <div className="text-sm text-stone-600">Oda zinafungwa: {closes}</div>
            <div className="text-sm text-stone-600">Kuleta: {fmtDateTime(cycle.delivery_at)}</div>
          </div>
          <span className="badge bg-orange-100 text-orange-800">{modeLabel[mode]}</span>
        </div>
        <div className="text-sm">Biriani zilizokubaliwa: <b>{s.portions}</b> / {cycle.capacity} · Wateja: <b>{s.customers}</b></div>
        <form action={toggleCycle}>
          <input type="hidden" name="cycle_id" value={cycle.id} />
          <input type="hidden" name="status" value={cycle.status === "open" ? "closed" : "open"} />
          <SubmitButton className="btn-ghost btn-sm">{cycle.status === "open" ? "Funga oda kabisa" : "Fungua tena"}</SubmitButton>
        </form>
      </section>

      {s.lateCount > 0 && (
        <Link href="/admin/orders" className="card block border-orange-300 bg-orange-50 font-medium">
          ⚠️ Kuna maombi {s.lateCount} ya ziada yanayosubiri uamuzi →
        </Link>
      )}

      <section className="card space-y-2">
        <h2 className="font-semibold">🍳 Mpango wa kupika</h2>
        {s.items.length === 0 ? (
          <p className="text-sm text-stone-500">Hakuna oda bado.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="text-left text-stone-500"><tr><th>Aina</th><th className="text-right">Idadi</th><th className="text-right">Mchele (kg)</th><th className="text-right">Nyama/Kuku (kg)</th></tr></thead>
              <tbody>
                {s.items.map((i) => (
                  <tr key={i.name} className="border-t"><td className="py-1.5">{i.name}</td><td className="text-right font-semibold">{i.qty}</td><td className="text-right">{i.rice.toFixed(1)}</td><td className="text-right">{i.protein.toFixed(1)}</td></tr>
                ))}
                <tr className="border-t-2 font-bold"><td className="py-1.5">Jumla</td><td className="text-right">{s.portions}</td><td className="text-right">{s.rice.toFixed(1)}</td><td className="text-right">{s.protein.toFixed(1)}</td></tr>
              </tbody>
            </table>
            <p className="text-xs text-stone-500">Makadirio ya kilo kwa kila biriani yanawekwa kwenye Mipangilio.</p>
          </>
        )}
      </section>

      <section className="card space-y-1">
        <h2 className="font-semibold">💰 Malipo</h2>
        <div className="flex justify-between text-sm"><span>Jumla ya mauzo</span><b>{tzs(s.revenue)}</b></div>
        <div className="flex justify-between text-sm text-green-700"><span>Yaliyolipwa</span><b>{tzs(s.paid)}</b></div>
        <div className="flex justify-between text-sm text-amber-700"><span>Yamewekwa muamala (hakiki)</span><b>{tzs(s.reported)}</b></div>
        <div className="flex justify-between text-sm text-red-700"><span>Hayajalipwa</span><b>{tzs(s.unpaid)}</b></div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">📣 Ujumbe wa WhatsApp</h2>
        {messages.map((m) => (
          <div key={m.title} className="space-y-2 rounded-xl bg-stone-50 p-3">
            <div className="text-sm font-medium">{m.title}</div>
            <pre className="whitespace-pre-wrap font-sans text-sm text-stone-700">{m.text}</pre>
            <div className="flex gap-2">
              <CopyButton text={m.text} />
              <a className="btn-green" target="_blank" href={`https://wa.me/?text=${encodeURIComponent(m.text)}`}>Tuma WhatsApp</a>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
