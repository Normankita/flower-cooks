import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

const nav = [
  ["/admin", "Muhtasari"],
  ["/admin/orders", "Oda"],
  ["/admin/delivery", "Uletaji"],
  ["/admin/settings", "Mipangilio"],
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl px-3 pb-16">
      <header className="sticky top-0 z-10 -mx-3 mb-4 flex items-center gap-1 overflow-x-auto border-b bg-[#fffaf3]/95 px-3 py-2 backdrop-blur">
        {nav.map(([href, label]) => (
          <Link key={href} href={href} className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium hover:bg-orange-100">
            {label}
          </Link>
        ))}
        <form action={logoutAction} className="ml-auto">
          <button className="rounded-full px-3 py-1.5 text-sm text-stone-500 hover:bg-stone-100">Toka</button>
        </form>
      </header>
      {children}
    </div>
  );
}
