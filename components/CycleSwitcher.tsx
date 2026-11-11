import type { Cycle } from "@/lib/types";

/** GET form: lets the admin look at an earlier cycle. No JS needed. */
export default function CycleSwitcher({ cycles, current }: { cycles: Cycle[]; current: string }) {
  return (
    <form method="get" className="flex items-center gap-2">
      <select name="c" defaultValue={current} className="input !w-auto !py-1.5 text-sm">
        {cycles.map((c) => (
          <option key={c.id} value={c.id}>{c.title}</option>
        ))}
      </select>
      <button className="btn-ghost btn-sm">Nenda</button>
    </form>
  );
}
