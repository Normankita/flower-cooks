"use client";

import { useState } from "react";

/** Kitchen position fields + a button that fills them from the phone's GPS (tap it once while at the kitchen). */
export default function KitchenLocation({ lat, lng }: { lat: number | null; lng: number | null }) {
  const [la, setLa] = useState(lat?.toString() ?? "");
  const [ln, setLn] = useState(lng?.toString() ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const locate = () => {
    if (!("geolocation" in navigator)) return setMsg("Simu haina GPS.");
    setBusy(true);
    setMsg("");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLa(p.coords.latitude.toFixed(6));
        setLn(p.coords.longitude.toFixed(6));
        setMsg(`Eneo limepatikana (±${Math.round(p.coords.accuracy)} m). Bonyeza “Hifadhi”.`);
        setBusy(false);
      },
      (e) => {
        setMsg(e.code === e.PERMISSION_DENIED ? "Hukuruhusu eneo kwenye kivinjari." : "Imeshindikana kupata eneo. Jaribu tena.");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="kitchen_lat">Latitudo ya jiko</label>
          <input id="kitchen_lat" name="kitchen_lat" className="input" inputMode="decimal" placeholder="-6.1630" value={la} onChange={(e) => setLa(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="kitchen_lng">Longitudo ya jiko</label>
          <input id="kitchen_lng" name="kitchen_lng" className="input" inputMode="decimal" placeholder="35.7516" value={ln} onChange={(e) => setLn(e.target.value)} />
        </div>
      </div>
      <button type="button" className="btn-ghost btn-sm" onClick={locate} disabled={busy}>
        {busy ? "Inatafuta…" : "📍 Tumia eneo langu la sasa"}
      </button>
      {msg && <p role="status" className="text-xs text-stone-600">{msg}</p>}
    </div>
  );
}
