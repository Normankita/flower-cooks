"use client";

import { useState } from "react";

/** "Show QR" button; the image is only requested once it is opened, so it costs no data for people who never tap it. */
export default function QrToggle({ src, show, hide, hint }: { src: string; show: string; hide: string; hint: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <button type="button" className="btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? `✕ ${hide}` : `▦ ${show}`}
      </button>
      {open && (
        <div className="space-y-1 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Lipa QR" width={320} className="mx-auto h-auto w-full max-w-xs rounded-2xl shadow-md" loading="lazy" />
          <p className="text-xs text-stone-600">{hint}</p>
        </div>
      )}
    </div>
  );
}
