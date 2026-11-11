"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin", icon: "📊", label: "Muhtasari" },
  { href: "/admin/orders", icon: "🧾", label: "Oda" },
  { href: "/admin/delivery", icon: "🚚", label: "Uletaji" },
  { href: "/admin/settings", icon: "⚙️", label: "Mipangilio" },
];

/** Floating glass tab bar, thumb-friendly on the cook's phone. */
export default function AdminNav() {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Admin">
      {tabs.map((t) => {
        const on = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className="tab" aria-current={on ? "page" : undefined}>
            <span aria-hidden>{t.icon}</span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
