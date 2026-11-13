"use client";

import { useState, useTransition } from "react";
import { confirmSms, previewSms, type SmsRow } from "@/app/admin/actions";
import { useToast } from "./Toaster";
import { tzs } from "@/lib/time";

const BADGE: Record<SmsRow["status"], [string, string]> = {
  ready: ["✅ Inalingana", "bg-green-100 text-green-800"],
  check: ["⚠️ Angalia kiasi", "bg-amber-100 text-amber-800"],
  duplicate: ["🚫 Namba imetumika tena", "bg-red-100 text-red-800"],
  missing: ["❌ Haijapatikana kwenye SMS", "bg-stone-200 text-stone-700"],
};

/**
 * The cook pastes the payment confirmation SMS messages she received; the app finds each customer's reported
 * transaction ID in them and, after her review, marks the orders paid. Nothing is stored; nothing changes until
 * she presses "Thibitisha".
 */
export default function SmsReconcile({ waiting }: { waiting: number }) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<SmsRow[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const compare = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("sms", text);
      const r = await previewSms(fd);
      if (!r.ok || !r.rows) {
        toast(r.error ?? "Imeshindikana.", "error");
        return;
      }
      setRows(r.rows);
      setPicked(new Set(r.rows.filter((x) => x.status === "ready").map((x) => x.orderId))); // only clean matches are pre-ticked
    });

  const confirm = () =>
    start(async () => {
      const fd = new FormData();
      fd.set("sms", text);
      for (const id of picked) fd.append("ids", id);
      const r = await confirmSms(fd);
      if (!r.ok) {
        toast(r.error ?? "Imeshindikana.", "error");
        return;
      }
      toast(`Malipo ${r.applied ?? 0} yamethibitishwa ✓`, "success");
      setRows(null);
      setPicked(new Set());
      setText("");
    });

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const found = rows?.filter((r) => r.status !== "missing") ?? [];
  const missing = rows?.filter((r) => r.status === "missing") ?? [];

  return (
    <details className="card">
      <summary className="cursor-pointer font-semibold">
        📩 Thibitisha malipo kwa SMS
        {waiting > 0 && <span className="badge ml-2 bg-amber-100 text-amber-800">{waiting} yanasubiri</span>}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-stone-600">
          Bandika ujumbe wa malipo ulioupokea kwenye simu (M-Pesa, Tigo, Airtel, HaloPesa), hata mingi kwa pamoja. Tutatafuta
          namba za muamala ambazo wateja wameweka. Hakuna kinachohifadhiwa, na hakuna kinachobadilika mpaka ubonyeze “Thibitisha”.
        </p>
        <textarea
          className="input"
          rows={6}
          placeholder="Bandika SMS hapa…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={30000}
        />
        <button type="button" className="btn btn-sm" onClick={compare} disabled={pending || text.trim().length < 10}>
          {pending && !rows ? "Inalinganisha…" : "Linganisha"}
        </button>

        {rows && (
          <div className="space-y-2">
            <div className="text-sm font-medium">
              Zilizopatikana: {found.length} · Hazijapatikana: {missing.length}
            </div>
            {found.map((r) => {
              const [label, cls] = BADGE[r.status];
              const selectable = r.status === "ready" || r.status === "check";
              return (
                <label key={r.orderId} className={`block space-y-1 rounded-2xl bg-(--glass) p-3 ${selectable ? "cursor-pointer" : "opacity-70"}`}>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 accent-orange-700" disabled={!selectable} checked={picked.has(r.orderId)} onChange={() => toggle(r.orderId)} />
                    <span className="font-semibold">{r.name}</span>
                    <span className="ml-auto font-bold">{tzs(r.total)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`badge ${cls}`}>{label}</span>
                    <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono">{r.ref}</span>
                    {r.phoneSeen && <span className="text-green-700">📞 namba ya simu inalingana</span>}
                  </div>
                  {r.snippet && <p className="rounded-xl bg-stone-50 p-2 text-xs text-stone-600">{r.snippet}</p>}
                </label>
              );
            })}
            {missing.length > 0 && (
              <details className="text-sm text-stone-600">
                <summary className="cursor-pointer">Hazijapatikana kwenye SMS ({missing.length})</summary>
                <ul className="mt-1 space-y-0.5">
                  {missing.map((r) => (
                    <li key={r.orderId}>{r.name} · {tzs(r.total)} · <span className="font-mono text-xs">{r.ref}</span></li>
                  ))}
                </ul>
              </details>
            )}
            <button type="button" className="btn w-full" onClick={confirm} disabled={pending || picked.size === 0}>
              {pending ? "Inathibitisha…" : `Thibitisha malipo (${picked.size})`}
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
