"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin top progress bar for client navigations. Starts when an internal link is clicked,
 * creeps forward while the next page loads, and completes when the URL changes.
 */
export default function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [pct, setPct] = useState(0);
  const [visible, setVisible] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = useRef(false);

  // Start on internal link clicks.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      active.current = true;
      clearTimeout(hide.current);
      clearInterval(tick.current);
      setVisible(true);
      setPct(8);
      tick.current = setInterval(() => setPct((p) => (p < 85 ? p + (90 - p) * 0.12 : p)), 200);
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      clearInterval(tick.current);
      clearTimeout(hide.current);
    };
  }, []);

  // Finish when the location changes.
  useEffect(() => {
    if (!active.current) return;
    active.current = false;
    clearInterval(tick.current);
    setPct(100);
    hide.current = setTimeout(() => {
      setVisible(false);
      setPct(0);
    }, 350);
  }, [pathname, search]);

  if (!visible) return null;
  return (
    <div
      className="nav-progress"
      role="progressbar"
      aria-hidden
      style={{ width: `${pct}%`, transition: pct === 100 ? "width .25s ease-out, opacity .3s .1s" : "width .3s ease-out", opacity: pct === 100 ? 0 : 1 }}
    />
  );
}
