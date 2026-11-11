"use client";

import { useSyncExternalStore } from "react";
import { setThemeMode } from "@/lib/theme";

// <html data-theme> is the source of truth; observe it so every toggle on the page stays in sync.
function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const snapshot = () => document.documentElement.dataset.theme ?? "light";

/** Sun/moon button: switches light ↔ dark with the circular reveal. */
export default function ThemeToggle({ label = "Badili mwonekano", className = "" }: { label?: string; className?: string }) {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "light");
  const dark = theme === "dark";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={dark}
      title={label}
      className={`glass inline-flex h-9 w-9 items-center justify-center rounded-full text-lg transition hover:scale-105 active:scale-90 ${className}`}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setThemeMode(dark ? "light" : "dark", { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
    >
      <span key={theme} className="qty-num" aria-hidden>{dark ? "🌙" : "☀️"}</span>
    </button>
  );
}
