import KitchenLocation from "@/components/KitchenLocation";
import SubmitButton from "@/components/SubmitButton";
import ToastForm from "@/components/ToastForm";
import { getMenu, getOffices, getCurrentCycle } from "@/lib/data";
import { toEATInput } from "@/lib/time";
import { saveCycle, saveItem, saveOffice } from "../../actions";

export default async function Settings() {
  const [cycle, items, offices] = await Promise.all([getCurrentCycle(), getMenu(false), getOffices(false)]);

  return (
    <div className="space-y-6">
      {cycle && (
        <ToastForm action={saveCycle} success="Mipangilio imehifadhiwa ✓" className="card space-y-3">
          <h2 className="font-semibold">Mzunguko wa sasa</h2>
          <input type="hidden" name="cycle_id" value={cycle.id} />
          <div><label className="label">Jina</label><input name="title" defaultValue={cycle.title} className="input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Oda zinafungwa</label><input type="datetime-local" name="closes_at" defaultValue={toEATInput(cycle.closes_at)} className="input" required /></div>
            <div><label className="label">Kuleta</label><input type="datetime-local" name="delivery_at" defaultValue={toEATInput(cycle.delivery_at)} className="input" required /></div>
            <div><label className="label">Kikomo cha biriani</label><input type="number" min={1} name="capacity" defaultValue={cycle.capacity} className="input" /></div>
            <div><label className="label">Lipa Namba</label><input name="lipa_namba" defaultValue={cycle.lipa_namba ?? ""} className="input" inputMode="numeric" /></div>
          </div>

          <div className="space-y-3 rounded-2xl bg-(--glass) p-3">
            <h3 className="font-semibold">🏠 Kuleta nyumbani</h3>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="home_enabled" defaultChecked={cycle.home_enabled} className="h-4 w-4 accent-orange-700" />
              Pokea oda za kuletewa nyumbani wiki hii
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="home_max_stops">Idadi ya juu ya vituo</label>
                <input id="home_max_stops" type="number" min={0} name="home_max_stops" defaultValue={cycle.home_max_stops ?? ""} placeholder="Bila kikomo" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="home_max_km">Umbali wa juu (km)</label>
                <input id="home_max_km" type="number" min={0.5} step={0.5} name="home_max_km" defaultValue={cycle.home_max_km ?? ""} placeholder="Bila kikomo" className="input" />
              </div>
            </div>
            <KitchenLocation lat={cycle.kitchen_lat} lng={cycle.kitchen_lng} />
            <p className="text-xs text-stone-500">
              Eneo la jiko linatumika kuonyesha umbali na kuzuia maeneo ya mbali (mstari wa moja kwa moja, si barabara).
              Eneo la wateja hufutwa baada ya siku 30.
            </p>
          </div>
          <SubmitButton>Hifadhi</SubmitButton>
        </ToastForm>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">Menyu</h2>
        <p className="text-xs text-stone-500">Kilo kwa biriani moja hutumika kwenye “Mpango wa kupika”. Badilisha kulingana na mapishi yako.</p>
        {[...items, null].map((it) => (
          <ToastForm key={it?.id ?? "new"} action={saveItem} success={it ? "Menyu imehifadhiwa ✓" : "Menyu imeongezwa ✓"} className="space-y-2 rounded-2xl bg-(--glass) p-3">
            {it && <input type="hidden" name="id" value={it.id} />}
            <input name="name" defaultValue={it?.name ?? ""} placeholder="Jina jipya la menyu" className="input" required />
            <div className="grid grid-cols-3 gap-2">
              <div><label className="label text-xs">Bei (TSh)</label><input type="number" name="price" min={0} defaultValue={it?.price ?? 8000} className="input" /></div>
              <div><label className="label text-xs">Mchele kg</label><input type="number" step="0.01" name="rice_kg" defaultValue={it?.rice_kg ?? 0.25} className="input" /></div>
              <div><label className="label text-xs">Nyama/Kuku kg</label><input type="number" step="0.01" name="protein_kg" defaultValue={it?.protein_kg ?? 0.2} className="input" /></div>
            </div>
            <div className="flex items-center justify-between">
              {it ? (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={it.active} className="accent-orange-700" /> Inapatikana</label>
              ) : <span />}
              <SubmitButton className="btn btn-sm">{it ? "Hifadhi" : "+ Ongeza"}</SubmitButton>
            </div>
          </ToastForm>
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Ofisi / maeneo ya kuleta</h2>
        {[...offices, null].map((o) => (
          <ToastForm key={o?.id ?? "new"} action={saveOffice} success={o ? "Ofisi imehifadhiwa ✓" : "Ofisi imeongezwa ✓"} className="flex items-center gap-2">
            {o && <input type="hidden" name="id" value={o.id} />}
            <input name="name" defaultValue={o?.name ?? ""} placeholder="Ofisi mpya" className="input" required />
            {o && <label className="flex items-center gap-1 text-sm whitespace-nowrap"><input type="checkbox" name="active" defaultChecked={o.active} className="accent-orange-700" /> Ipo</label>}
            <SubmitButton className="btn btn-sm">{o ? "Hifadhi" : "+"}</SubmitButton>
          </ToastForm>
        ))}
      </section>
    </div>
  );
}
