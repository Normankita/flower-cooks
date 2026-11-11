"use client";

import { useEffect } from "react";
import { readThemeMode, resolveTheme } from "@/lib/theme";

/** Follows the phone's light/dark setting live, unless the user picked a theme explicitly. Renders nothing. */
export default function ThemeSync() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readThemeMode() !== "system") return;
      document.documentElement.dataset.theme = resolveTheme("system", mq.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return null;
}
