"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Cycle } from "@/lib/types";

/** Lets the admin look at an earlier cycle. Switches as soon as a round is picked; works without JS via the form. */
export default function CycleSwitcher({ cycles, current }: { cycles: Cycle[]; current: string }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();

  return (
    <form method="get" className="flex items-center gap-2">
      <select
        name="c"
        value={current}
        disabled={pending}
        aria-busy={pending}
        aria-label="Chagua mzunguko"
        onChange={(e) => start(() => router.push(`${path}?c=${e.target.value}`))}
        className="input w-auto! py-1.5! text-sm"
      >
        {cycles.map((c) => (
          <option key={c.id} value={c.id}>{c.title}</option>
        ))}
      </select>
      {pending && <span className="spinner text-orange-700" role="status" aria-label="Inapakia" />}
      <noscript>
        <button className="btn-ghost btn-sm">Nenda</button>
      </noscript>
    </form>
  );
}
