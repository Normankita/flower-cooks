import { fmtKm, haversineKm, navUrl, viewUrl, type LatLng } from "@/lib/geo";
import type { Order } from "@/lib/types";

/** Where a customer's home order goes: distance from the kitchen and one-tap navigation. Server component. */
export const orderPoint = (o: Pick<Order, "delivery_lat" | "delivery_lng">): LatLng | null =>
  o.delivery_lat != null && o.delivery_lng != null ? { lat: Number(o.delivery_lat), lng: Number(o.delivery_lng) } : null;

export default function HomeStop({ o, kitchen }: { o: Order; kitchen: LatLng | null }) {
  const at = orderPoint(o);
  const km = at && kitchen ? haversineKm(kitchen, at) : null;
  // With coordinates: turn-by-turn navigation. Otherwise the customer's pasted link (validated on save), if any.
  const go = at ? navUrl(at) : o.location_url;

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="badge bg-orange-100 text-orange-800">🏠 Nyumbani</span>
      {km != null && <span className="font-semibold">{fmtKm(km)} <span className="font-normal text-stone-500">kutoka jikoni</span></span>}
      {go ? (
        <a className="btn-green" href={go} target="_blank" rel="noopener noreferrer">🧭 Nenda</a>
      ) : (
        <span className="text-xs text-stone-500">Hakuna ramani — tumia maelezo au piga simu</span>
      )}
      {at && (
        <a className="btn-ghost btn-sm" href={viewUrl(at)} target="_blank" rel="noopener noreferrer">🗺️ Ramani</a>
      )}
    </div>
  );
}
