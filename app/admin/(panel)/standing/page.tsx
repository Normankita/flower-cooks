import Link from "next/link";
import StandingNow from "@/components/StandingNow";
import SubmitButton from "@/components/SubmitButton";
import ToastForm from "@/components/ToastForm";
import { getCurrentCycle, getMenu } from "@/lib/data";
import { displayPhone } from "@/lib/phone";
import { priceStanding } from "@/lib/standing";
import { listStanding, weekState, type Standing, type WeekState } from "@/lib/standing-db";
import { tzs } from "@/lib/time";
import { adminSetStanding } from "../../actions";

const weekLabel = (w: WeekState): [string, string] =>
  w.state === "ordered" ? ["Oda imewekwa", "bg-green-100 text-green-800"]
  : w.state === "skipped" ? ["Ameruka wiki hii", "bg-stone-200 text-stone-700"]
  : w.state === "missing" ? ["Haijawekwa", "bg-amber-100 text-amber-800"]
  : ["Oda zimefungwa", "bg-stone-200 text-stone-700"];

export default async function StandingAdmin() {
  const cycle = await getCurrentCycle();
  let list: Standing[] = [];
  let problem = "";
  try {
    list = await listStanding();
  } catch {
    problem = "Haiwezi kupakia oda za kila wiki. Je, umeendesha SQL ya migration 0010?";
  }
  const menu = await getMenu(false);
  const names = new Map(menu.map((m) => [m.id, m.name]));
  const weeks = await Promise.all(list.map((s) => weekState(s, cycle).catch(() => ({ state: "closed" }) as WeekState)));
  const active = list.filter((s) => s.active).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">🔁 Oda za kila wiki</h1>
        <p className="text-sm text-stone-600">Wateja wanaorudia oda yao kila wiki. Zinawekwa kiotomatiki unapotengeneza mzunguko mpya; mteja anaweza kuruka wiki yoyote.</p>
      </div>
      {problem && <p className="card text-red-700">{problem}</p>}

      <section className="card space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Zinazofanya kazi</span>
          <b>{active} / {list.length}</b>
        </div>
        <StandingNow />
        <p className="text-xs text-stone-500">Oda za kila wiki zinachukua nafasi kama oda nyingine; zikizidi kikomo hazitawekwa. Hakuna kinachojirudia ukibonyeza tena.</p>
      </section>

      {list.length === 0 && !problem && <p className="card text-sm text-stone-500">Hakuna bado. Mteja anaweka “Rudia kila wiki” kwenye ukurasa wa oda yake.</p>}

      {list.map((s, i) => {
        const priced = priceStanding(s.lines, menu);
        const [label, cls] = weekLabel(weeks[i]);
        return (
          <div key={s.id} className={`card space-y-2 ${s.active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{s.customers?.name}</div>
                <a className="text-sm text-orange-700 underline" href={`tel:+${s.customers?.phone}`}>{displayPhone(s.customers?.phone ?? "")}</a>
                <div className="text-sm text-stone-600">{s.offices?.name}{s.delivery_note ? ` · ${s.delivery_note}` : ""}</div>
              </div>
              <div className="text-right">
                <div className="font-bold">{tzs(priced.total)}</div>
                <span className={`badge ${cls}`}>{s.active ? label : "Imesimamishwa"}</span>
              </div>
            </div>
            <div className="text-sm">{s.lines.map((l) => `${l.qty}× ${names.get(l.item_id) ?? "?"}`).join(", ")}</div>
            <div className="flex flex-wrap gap-2">
              <ToastForm action={adminSetStanding} success={s.active ? "Imesimamishwa" : "Imewashwa ✓"}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="active" value={s.active ? "0" : "1"} />
                <SubmitButton className="btn-ghost btn-sm">{s.active ? "Simamisha" : "Washa"}</SubmitButton>
              </ToastForm>
              <ToastForm action={adminSetStanding} success="Imefutwa">
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="do" value="delete" />
                <SubmitButton className="btn-red">Futa</SubmitButton>
              </ToastForm>
            </div>
          </div>
        );
      })}
      <Link href="/admin/orders" className="text-sm text-orange-700 underline">← Rudi kwenye oda</Link>
    </div>
  );
}
