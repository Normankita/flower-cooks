"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Dict } from "@/lib/i18n";
import { readThemeMode, setThemeMode, THEME_ASKED_KEY, type ThemeMode } from "@/lib/theme";

const subscribe = () => () => {};
const askedSnapshot = () => {
  try {
    return localStorage.getItem(THEME_ASKED_KEY) ? "asked" : "new";
  } catch {
    return "asked"; // no storage → don't nag on every load
  }
};

/**
 * First visit only: a small glass sheet that suggests choosing light, dark, or "like my phone".
 * The answer (or closing it) is remembered, so it never shows again; the sun/moon toggle stays available.
 */
export default function ThemeSuggest({ t }: { t: Dict }) {
  const asked = useSyncExternalStore(subscribe, askedSnapshot, () => "asked");
  const [ready, setReady] = useState(false); // small delay so it doesn't fight the page-load animation
  const [done, setDone] = useState(false);
  const [current, setCurrent] = useState<ThemeMode>("system");

  useEffect(() => {
    if (asked !== "new") return;
    const id = window.setTimeout(() => {
      setCurrent(readThemeMode());
      setReady(true);
    }, 1400);
    return () => window.clearTimeout(id);
  }, [asked]);

  const finish = () => {
    try {
      localStorage.setItem(THEME_ASKED_KEY, "1");
    } catch {}
    setDone(true);
  };

  if (asked !== "new" || !ready || done) return null;

  const options: { mode: ThemeMode; icon: string; label: string }[] = [
    { mode: "light", icon: "☀️", label: t.themeLight },
    { mode: "dark", icon: "🌙", label: t.themeDark },
    { mode: "system", icon: "📱", label: t.themeAuto },
  ];

  return (
    <div className="theme-sheet glass rounded-3xl p-4" role="dialog" aria-label={t.themeTitle}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{t.themeTitle}</div>
          <div className="text-xs text-stone-600">{t.themeBody}</div>
        </div>
        <button type="button" aria-label={t.installClose} className="rounded-full p-1.5 text-stone-500 transition hover:bg-(--glass)" onClick={finish}>
          ✕
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button
            key={o.mode}
            type="button"
            className="option flex-col gap-1 p-2.5! text-sm font-medium"
            data-on={current === o.mode}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setCurrent(o.mode);
              setThemeMode(o.mode, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
              window.setTimeout(finish, 700); // let them see the result first
            }}
          >
            <span className="text-xl" aria-hidden>{o.icon}</span>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
