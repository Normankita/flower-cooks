"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Dict } from "@/lib/i18n";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DEFAULT_DISMISS_KEY = "bo_install_dismissed";
const DISMISS_DAYS = 14;

/** "ios" | "standalone" | "dismissed" | "other" — a primitive so useSyncExternalStore stays stable. */
function envSnapshot(DISMISS_KEY: string): string {
  if (typeof window === "undefined") return "other";
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "standalone";
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (at && Date.now() - at < DISMISS_DAYS * 86400_000) return "dismissed";
  } catch {}
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "other";
}
const subscribe = () => () => {};

/**
 * Android/Chrome: shows an "Install" button using the browser's install prompt.
 * iPhone/iPad: no prompt exists, so show the "Share → Add to Home Screen" hint.
 * Hidden when already installed, or for 14 days after the user closes it.
 */
export default function InstallPrompt({
  t,
  title,
  body,
  dismissKey = DEFAULT_DISMISS_KEY,
}: {
  t: Dict;
  /** override the card text (the admin install card uses its own wording) */
  title?: string;
  body?: string;
  /** separate key per app, so closing one card doesn't hide the other */
  dismissKey?: string;
}) {
  const env = useSyncExternalStore(subscribe, () => envSnapshot(dismissKey), () => "other");
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it for our own button
      setEvt(e as InstallEvent);
    };
    const onInstalled = () => {
      setEvt(null);
      setHidden(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const close = () => {
    try {
      localStorage.setItem(dismissKey, String(Date.now()));
    } catch {}
    setHidden(true);
  };

  if (hidden || env === "standalone" || env === "dismissed") return null;
  if (!evt && env !== "ios") return null; // nothing to offer (e.g. desktop Firefox, or prompt not available yet)

  return (
    <div className="card flex items-center gap-3 p-3!" role="region" aria-label={t.installTitle}>
      <span className="text-2xl" aria-hidden>📲</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title ?? t.installTitle}</div>
        {evt ? (
          <div className="text-xs text-stone-600">{body ?? t.installBody}</div>
        ) : (
          <div className="text-xs text-stone-600">{t.installIos}</div>
        )}
      </div>
      {evt && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            await evt.prompt();
            const { outcome } = await evt.userChoice;
            setEvt(null);
            if (outcome === "dismissed") close();
          }}
        >
          {t.installBtn}
        </button>
      )}
      <button type="button" aria-label={t.installClose} className="rounded-full p-1.5 text-stone-500 transition hover:bg-(--glass)" onClick={close}>
        ✕
      </button>
    </div>
  );
}
