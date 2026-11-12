import Link from "next/link";
import OrderForm from "@/components/OrderForm";
import { getCurrentCycle, getMenu, getOffices } from "@/lib/data";
import { strings } from "@/lib/i18n";
import { adminPlaceOrder } from "../../../actions";

export default async function NewOrder() {
  const cycle = await getCurrentCycle();
  if (!cycle) return <p className="card">Tengeneza mzunguko kwanza.</p>;
  const [items, offices] = await Promise.all([getMenu(), getOffices()]);
  return (
    <div className="space-y-3">
      <Link href="/admin/orders" className="text-sm text-orange-700 underline">← Rudi kwenye oda</Link>
      <h1 className="text-xl font-bold">Weka oda kwa niaba ya mteja</h1>
      <p className="text-sm text-stone-600">Kwa oda zilizotumwa WhatsApp au simu. Inapita muda wa kufunga na kikomo cha idadi.</p>
      <OrderForm
        action={adminPlaceOrder}
        cycleId={cycle.id}
        items={items.map(({ id, name, price }) => ({ id, name, price }))}
        offices={offices.map(({ id, name }) => ({ id, name }))}
        lang="sw"
        t={strings("sw")}
        submitLabel="Weka oda"
        successText="Oda imewekwa ✓"
        remember={false}
        sticky={false}
        homeEnabled
        homeGps={false}
      />
    </div>
  );
}
