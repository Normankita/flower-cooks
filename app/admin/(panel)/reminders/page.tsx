import Link from "next/link";
import ReminderPanel from "@/components/ReminderPanel";
import WaList from "@/components/WaList";
import { getCurrentCycle } from "@/lib/data";
import { db } from "@/lib/supabase";
import { fmtDateTime } from "@/lib/time";
import { recentLog, runReminder, whatsappList, type RunSummary, type WaRow } from "@/lib/reminders-db";
import { smsConfigured, smsProvider } from "@/lib/sms";
import type { Kind } from "@/lib/reminders";

const KINDS: { kind: Kind; title: string; when: string; wa: string }[] = [
  { kind: "wed", title: "📅 Kikumbusho cha Jumatano", when: "Hutumwa kiotomatiki Jumatano saa 4 asubuhi kwa wateja waliokubali SMS ambao hawajaagiza wiki hii.", wa: "Jumatano" },
  { kind: "thu", title: "⏰ Nafasi ya mwisho (Alhamisi)", when: "Hutumwa kiotomatiki Alhamisi saa 9 mchana kwa wasioagiza bado.", wa: "Alhamisi" },
  { kind: "fri", title: "🛵 “Tunakuja” (Ijumaa)", when: "Unabonyeza kitufe mwenyewe unapoanza safari. Kwa wenye oda zinazosubiri kuletwa.", wa: "Ijumaa" },
];
const kindLabel: Record<string, string> = { wed: "Jumatano", thu: "Alhamisi", fri: "Ijumaa", test: "Jaribio" };

export default async function RemindersPage() {
  const cycle = await getCurrentCycle();
  if (!cycle) return <p className="card">Hakuna mzunguko.</p>;

  let problem = "";
  let previews: RunSummary[] = [];
  let wa: ({ ok: false; reason: string } | { ok: true; rows: WaRow[] })[] = [];
  let log: Awaited<ReturnType<typeof recentLog>> = [];
  let optedIn = 0;
  try {
    previews = await Promise.all(KINDS.map((k) => runReminder(k.kind, { dry: true, force: true })));
    wa = await Promise.all(KINDS.map((k) => whatsappList(k.kind)));
    log = await recentLog(cycle.id);
    const c = await db().from("customers").select("id", { count: "exact", head: true }).eq("sms_opt_in", true);
    optedIn = c.count ?? 0;
  } catch {
    problem = "Haiwezi kupakia vikumbusho. Je, umeendesha SQL ya migration 0008?";
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">📣 Vikumbusho</h1>
        <p className="text-sm text-stone-600">{cycle.title} · oda zinafungwa {fmtDateTime(cycle.closes_at)}</p>
      </div>
      {problem && <p className="card text-red-700">{problem}</p>}

      <section className="card space-y-1 text-sm">
        <div className="flex justify-between"><span>SMS</span><b className={smsConfigured() ? "text-green-700" : "text-red-700"}>{smsConfigured() ? `Imewekwa (${smsProvider()})` : "Haijawekwa"}</b></div>
        <div className="flex justify-between"><span>Wateja waliokubali SMS</span><b>{optedIn}</b></div>
        <p className="pt-1 text-xs text-stone-500">Mteja hukubali kwa kuweka tiki kwenye fomu ya oda, na anaweza kujiondoa kupitia kiungo kwenye kila SMS. Hakuna SMS inayotumwa bila ridhaa yake.</p>
      </section>

      {KINDS.map((k, i) => {
        const p = previews[i];
        return p ? (
          <ReminderPanel
            key={k.kind}
            kind={k.kind}
            title={k.title}
            when={k.when}
            smsReady={smsConfigured()}
            planned={p.planned}
            segments={p.segments}
            sample={p.sample}
            reason={p.ok ? undefined : p.reason}
          />
        ) : null;
      })}

      <section className="card space-y-3">
        <h2 className="font-semibold">📲 WhatsApp (bure, kwa kubonyeza)</h2>
        <p className="text-xs text-stone-500">Bonyeza jina la mteja: WhatsApp itafunguka na ujumbe tayari. Baada ya kubonyeza anawekewa tiki. Haihitaji kukubali SMS kwa sababu unatuma wewe mwenyewe.</p>
        {KINDS.map((k, i) => {
          const list = wa[i];
          return (
            <details key={k.kind} className="rounded-2xl bg-(--glass) p-3">
              <summary className="cursor-pointer font-medium">{k.wa} {list?.ok ? `(${list.rows.filter((r) => !r.sent).length} bado)` : ""}</summary>
              <div className="mt-2">{list?.ok ? <WaList kind={k.kind} rows={list.rows} /> : <p className="text-sm text-stone-500">{list?.reason}</p>}</div>
            </details>
          );
        })}
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">🧾 Zilizotumwa hivi karibuni</h2>
        {log.length === 0 && <p className="text-sm text-stone-500">Bado hakuna.</p>}
        {log.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{l.customers?.name ?? "—"} · {kindLabel[l.kind]} · {l.channel === "sms" ? "SMS" : "WhatsApp"}</span>
            <span className={`badge ${l.status === "sent" ? "bg-green-100 text-green-800" : l.status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
              {l.status === "sent" ? "Imetumwa" : l.status === "failed" ? `Imeshindwa${l.error ? `: ${l.error}` : ""}` : "Inasubiri"}
            </span>
          </div>
        ))}
      </section>
      <Link href="/admin" className="text-sm text-orange-700 underline">← Rudi Muhtasari</Link>
    </div>
  );
}
