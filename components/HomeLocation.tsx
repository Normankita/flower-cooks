"use client";

import { useState } from "react";
import type { Dict } from "@/lib/i18n";
import { fill } from "@/lib/i18n";
import { viewUrl } from "@/lib/geo";

export type Loc = { lat: number; lng: number; acc: number | null; saved?: boolean };
type Status = "idle" | "locating" | "denied" | "fail";

/**
 * "Deliver to my home" panel inside the order form.
 * - "Are you at home now?" Yes → one tap uses the phone's GPS (permission is asked only on that tap).
 * - No / GPS denied or failed → paste a map link (Google Maps or a WhatsApp location).
 * The landmark text is a normal required field in the form (OrderForm). Renders hidden inputs for the server.
 */
export default function HomeLocation({
  t,
  allowGps,
  loc,
  setLoc,
  link,
  setLink,
}: {
  t: Dict;
  /** false in the cook's manual-entry form: her GPS would be the kitchen, not the customer */
  allowGps: boolean;
  loc: Loc | null;
  setLoc: (l: Loc | null) => void;
  link: string;
  setLink: (v: string) => void;
}) {
  const [atHome, setAtHome] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const locate = () => {
    if (!("geolocation" in navigator)) return setStatus("fail");
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) });
        setStatus("idle");
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "fail"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const showLinkField = !allowGps || atHome === false || status === "denied" || status === "fail";

  return (
    <div className="space-y-3 rounded-2xl bg-orange-100/60 p-3">
      <input type="hidden" name="delivery_lat" value={loc?.lat ?? ""} />
      <input type="hidden" name="delivery_lng" value={loc?.lng ?? ""} />
      <input type="hidden" name="delivery_accuracy" value={loc?.acc ?? ""} />

      {allowGps && !loc && atHome === null && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t.homeAreYouHome}</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                setAtHome(true);
                locate(); // started from the tap, so the browser can show its permission prompt
              }}
            >
              {t.homeYes}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setAtHome(false)}>
              {t.homeNo}
            </button>
          </div>
        </div>
      )}

      {allowGps && !loc && atHome === true && status === "locating" && (
        <p role="status" className="flex items-center gap-2 text-sm text-stone-700">
          <span className="spinner" aria-hidden /> {t.homeLocating}
        </p>
      )}

      {allowGps && loc && (
        <div className="space-y-2" role="status">
          <p className="text-sm font-semibold text-green-700">
            {loc.saved ? t.homeSavedLoc : fill(t.homeGot, { m: loc.acc ?? "?" })}
          </p>
          <div className="flex flex-wrap gap-2">
            <a className="btn-ghost btn-sm" href={viewUrl(loc)} target="_blank" rel="noopener noreferrer">
              🗺️ {t.homeViewMap}
            </a>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                setLoc(null);
                setAtHome(null);
                setStatus("idle");
              }}
            >
              {loc.saved ? t.homeChange : t.homeRetry}
            </button>
          </div>
        </div>
      )}

      {allowGps && !loc && status === "denied" && <p role="alert" className="text-sm text-red-700">{t.homeGpsDenied}</p>}
      {allowGps && !loc && status === "fail" && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-red-700">{t.homeGpsFail}</p>
          <button type="button" className="btn-ghost btn-sm" onClick={locate}>📍 {t.homeRetry}</button>
        </div>
      )}

      {allowGps && !loc && atHome === false && (
        <button type="button" className="text-xs text-orange-800 underline" onClick={() => { setAtHome(true); locate(); }}>
          📍 {t.homeUseGps}
        </button>
      )}

      {showLinkField && (
        <div>
          <label className="label" htmlFor="location_url">{t.homeLinkLabel}</label>
          <input
            id="location_url"
            name="location_url"
            className="input"
            inputMode="url"
            autoComplete="off"
            placeholder="https://maps.app.goo.gl/…"
            maxLength={400}
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <p className="mt-1 text-xs text-stone-600">{t.homeLinkHint}</p>
        </div>
      )}

      <p className="text-xs text-stone-600">🔒 {t.homePrivacy}</p>
    </div>
  );
}
