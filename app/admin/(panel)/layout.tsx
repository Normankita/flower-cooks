import AdminNav from "@/components/AdminNav";
import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl px-3 pb-32">
      <header className="glass sticky top-2 z-20 mb-4 mt-2 flex items-center justify-between rounded-2xl px-4 py-2.5">
        <div className="flex items-center gap-2 font-bold text-orange-800">
          <span className="float text-xl" aria-hidden>🍛</span>
          <span>{process.env.NEXT_PUBLIC_BRAND ?? "Biriani ya Ijumaa"}</span>
        </div>
        <form action={logoutAction}>
          <button className="rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-white/70">Toka</button>
        </form>
      </header>
      {children}
      <AdminNav />
    </div>
  );
}
