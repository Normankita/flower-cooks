"use client";

import { useState } from "react";
import { markWhatsAppSent } from "@/app/admin/actions";
import { displayPhone } from "@/lib/phone";
import type { WaRow } from "@/lib/reminders-db";

/** Free WhatsApp broadcast helper: tap a name to open WhatsApp with the message ready; it is ticked once opened. */
export default function WaList({ kind, rows }: { kind: "wed" | "thu" | "fri"; rows: WaRow[] }) {
  const [done, setDone] = useState<Set<string>>(new Set(rows.filter((r) => r.sent).map((r) => r.id)));
  if (rows.length === 0) return <p className="text-sm text-stone-500">Hakuna wa kutumia.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const ok = done.has(r.id);
        return (
          <li key={r.id} className={`flex items-center justify-between gap-2 rounded-xl bg-(--glass) px-3 py-2 ${ok ? "opacity-60" : ""}`}>
            <div className="min-w-0">
              <div className="truncate font-medium">{r.name}</div>
              <div className="text-xs text-stone-500">{displayPhone(r.phone)}</div>
            </div>
            <a
              className={ok ? "btn-ghost btn-sm" : "btn-green"}
              href={`https://wa.me/${r.phone}?text=${encodeURIComponent(r.text)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                setDone((d) => new Set(d).add(r.id)); // tick right away; saved in the background
                void markWhatsAppSent(kind, r.id);
              }}
            >
              {ok ? "✓ Imetumwa" : "WhatsApp"}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
