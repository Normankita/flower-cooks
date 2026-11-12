// Pure geo helpers for home delivery (no imports, so they can be unit-tested directly).

export type LatLng = { lat: number; lng: number };

/** Rough bounding box of Tanzania. Rejects obviously wrong coordinates (0,0 / swapped / other countries). */
export const inTanzania = ({ lat, lng }: LatLng) => lat >= -11.8 && lat <= -0.9 && lng >= 29.3 && lng <= 40.5;

const validRange = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Straight-line (great-circle) distance in km. NOT road distance — label it "~". */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "~850 m" / "~3.2 km" */
export function fmtKm(km: number): string {
  return km < 1 ? `~${Math.round(km * 1000 / 10) * 10} m` : `~${km.toFixed(1)} km`;
}

/**
 * Coordinates from pasted text: "-6.1630, 35.7516", or a Google/WhatsApp maps link containing them
 * (…@-6.16,35.75,15z · …?q=-6.16,35.75 · …!3d-6.16!4d35.75). Short links (maps.app.goo.gl/…) carry none → null.
 */
export function parseLatLng(text: string): LatLng | null {
  let s = text;
  try {
    s = decodeURIComponent(text);
  } catch {} // malformed %-escapes: use the text as-is
  s = s.trim();
  const patterns = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /[?&](?:q|ll|query|destination|center)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
    /^(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)$/,
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (validRange(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

const MAP_HOSTS = new Set([
  "maps.google.com", "www.google.com", "google.com", "maps.app.goo.gl", "goo.gl",
  "maps.apple.com", "waze.com", "www.waze.com", "www.openstreetmap.org", "openstreetmap.org",
]);

/**
 * A pasted map link, only if it is https and points at a known maps service. The cook taps these links, so
 * customer-supplied URLs must never be arbitrary. Returns the cleaned URL or null.
 */
export function normalizeMapUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s || s.length > 400) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !MAP_HOSTS.has(u.hostname.toLowerCase())) return null;
  // google.com / goo.gl are only maps when under /maps
  if ((u.hostname === "www.google.com" || u.hostname === "google.com" || u.hostname === "goo.gl") && !u.pathname.startsWith("/maps")) return null;
  return u.toString();
}

export type HomeLocation = { lat: number | null; lng: number | null; accuracyM: number | null; url: string | null };

/**
 * Validate the "deliver to my home" fields from the order form.
 * - a landmark/description is always required (it is what the rider actually uses to find the house);
 * - coordinates (phone GPS) are optional but, if present, must be inside Tanzania;
 * - a pasted link/coordinates is optional but must be a known maps service (or plain "lat, lng").
 * GPS coordinates win over coordinates parsed from a pasted link.
 */
export function parseHome(i: {
  lat?: string | null;
  lng?: string | null;
  accuracy?: string | null;
  link?: string | null;
  landmark?: string | null;
}): { ok: true; home: HomeLocation } | { ok: false; code: "errLandmark" | "errLocation" } {
  if (!i.landmark || i.landmark.trim().length < 3) return { ok: false, code: "errLandmark" };

  let at: LatLng | null = null;
  const latS = (i.lat ?? "").trim();
  const lngS = (i.lng ?? "").trim();
  if (latS || lngS) {
    const p = { lat: Number(latS), lng: Number(lngS) };
    if (!latS || !lngS || !validRange(p.lat, p.lng) || !inTanzania(p)) return { ok: false, code: "errLocation" };
    at = p;
  }

  let url: string | null = null;
  const link = (i.link ?? "").trim();
  if (link) {
    const plain = parseLatLng(link);
    if (plain && !/^https?:/i.test(link)) {
      if (!inTanzania(plain)) return { ok: false, code: "errLocation" };
      at = at ?? plain; // typed coordinates, not a URL: keep as coordinates only
    } else {
      url = normalizeMapUrl(link);
      if (!url) return { ok: false, code: "errLocation" };
      const fromUrl = parseLatLng(url);
      if (fromUrl) {
        if (!inTanzania(fromUrl)) return { ok: false, code: "errLocation" };
        at = at ?? fromUrl;
      }
    }
  }

  const acc = Math.round(Number(i.accuracy));
  return {
    ok: true,
    home: {
      lat: at ? Math.round(at.lat * 1e6) / 1e6 : null,
      lng: at ? Math.round(at.lng * 1e6) / 1e6 : null,
      accuracyM: at && Number.isFinite(acc) && acc >= 0 && acc < 100000 && latS ? acc : null,
      url,
    },
  };
}

/** Google Maps turn-by-turn navigation to a point (opens the Maps app on phones; no API key). */
export const navUrl = (to: LatLng) =>
  `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving`;

/** Just show a point on the map. */
export const viewUrl = (p: LatLng) => `https://www.google.com/maps?q=${p.lat},${p.lng}`;

export type Stop<T = unknown> = { at: LatLng; item: T };

/** Greedy nearest-neighbour order starting from `from`. Good enough for ~10 stops; not an optimal tour. */
export function orderStops<T>(from: LatLng, stops: Stop<T>[]): Stop<T>[] {
  const left = [...stops];
  const out: Stop<T>[] = [];
  let cur = from;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (haversineKm(cur, left[i].at) < haversineKm(cur, left[best].at)) best = i;
    const [next] = left.splice(best, 1);
    out.push(next);
    cur = next.at;
  }
  return out;
}

/**
 * Multi-stop Google Maps links for an ordered list of stops. Maps limits waypoints per link (about 9 on phones),
 * so long routes are split: each link starts where the previous one ended.
 */
export function routeUrls(origin: LatLng | null, ordered: LatLng[], maxStopsPerLink = 10): string[] {
  const urls: string[] = [];
  let start = origin;
  for (let i = 0; i < ordered.length; i += maxStopsPerLink) {
    const chunk = ordered.slice(i, i + maxStopsPerLink);
    const dest = chunk[chunk.length - 1];
    const via = chunk.slice(0, -1);
    const p = new URLSearchParams({ api: "1", destination: `${dest.lat},${dest.lng}`, travelmode: "driving" });
    if (start) p.set("origin", `${start.lat},${start.lng}`);
    if (via.length) p.set("waypoints", via.map((v) => `${v.lat},${v.lng}`).join("|"));
    urls.push(`https://www.google.com/maps/dir/?${p.toString()}`);
    start = dest;
  }
  return urls;
}
