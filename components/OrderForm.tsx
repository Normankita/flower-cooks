"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import SubmitButton from "./SubmitButton";
import { fill, type Dict } from "@/lib/i18n";
import { RETRY_DELAYS_S } from "@/lib/db-error";

type Item = { id: string; name: string; price: number };
type Office = { id: string; name: string };
type State = { error?: string; retry?: boolean; n?: number };

const KEY = "bo_customer";

export default function OrderForm({
  action,
  cycleId,
  items,
  offices,
  lang,
  t,
  submitLabel,
  remember = true,
}: {
  action: (s: State, fd: FormData) => Promise<State>;
  cycleId: string;
  items: Item[];
  offices: Office[];
  lang: string;
  t: Dict;
  submitLabel: string;
  remember?: boolean;
}) {
  // n counts consecutive network failures; it drives the automatic retry below.
  const [state, formAction] = useActionState(async (prev: State, fd: FormData): Promise<State> => {
    const r = await action(prev, fd);
    return { ...r, n: r.retry ? (prev.n ?? 0) + 1 : 0 };
  }, {});
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // One key per form: a resubmit after a network failure returns the same order instead of a duplicate.
  const [idem, setIdem] = useState("");
  const [extra, setExtra] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [office, setOffice] = useState("");
  const [note, setNote] = useState("");
  const [pay, setPay] = useState<"lipa" | "cash">("lipa");
  const [qty, setQty] = useState<Record<string, number>>({});

  // Returning customers: prefill from this device.
  useEffect(() => {
    if (!remember) return;
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (!s) return;
      /* eslint-disable react-hooks/set-state-in-effect */
      setName(s.name ?? "");
      setPhone(s.phone ?? "");
      setOffice(offices.some((o) => o.id === s.office) ? s.office : "");
      setNote(s.note ?? "");
      if (s.pay === "cash" || s.pay === "lipa") setPay(s.pay);
      const q: Record<string, number> = {};
      for (const it of items) if (s.qty?.[it.id] > 0) q[it.id] = s.qty[it.id];
      setQty(q);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {}
  }, [remember, offices, items]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdem(crypto.randomUUID());
  }, []);

  // Network failure: resubmit automatically (with backoff), or immediately when the connection returns.
  useEffect(() => {
    if (!state.retry) return;
    const n = state.n ?? 1;
    if (n > RETRY_DELAYS_S.length) return; // give up; the customer can press the button
    const go = () => formRef.current?.requestSubmit();
    timer.current = setTimeout(() => {
      if (navigator.onLine !== false) go();
    }, RETRY_DELAYS_S[n - 1] * 1000);
    const onOnline = () => {
      clearTimeout(timer.current);
      go();
    };
    window.addEventListener("online", onOnline);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener("online", onOnline);
    };
  }, [state]);

  const total = items.reduce((s, i) => s + (qty[i.id] ?? 0) * i.price, 0);
  const bump = (id: string, d: number) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(20, (q[id] ?? 0) + d)) }));

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-5"
      onSubmit={() => {
        clearTimeout(timer.current);
        if (!remember) return;
        try {
          localStorage.setItem(KEY, JSON.stringify({ name, phone, office, note, pay, qty }));
        } catch {}
      }}
    >
      <input type="hidden" name="cycle_id" value={cycleId} />
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="idem_key" value={idem} />

      <section className="card space-y-3">
        <h2 className="font-semibold">{t.items}</h2>
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">{it.name}</div>
              <div className="text-sm text-stone-500">TSh {it.price.toLocaleString("en-US")}</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="-" className="h-10 w-10 rounded-full border border-stone-300 text-xl" onClick={() => bump(it.id, -1)}>
                −
              </button>
              <span className="w-6 text-center text-lg font-semibold tabular-nums">{qty[it.id] ?? 0}</span>
              <button type="button" aria-label="+" className="h-10 w-10 rounded-full border border-orange-700 bg-orange-700 text-xl text-white" onClick={() => bump(it.id, 1)}>
                +
              </button>
              <input type="hidden" name={`qty_${it.id}`} value={qty[it.id] ?? 0} />
            </div>
          </div>
        ))}
        <div className="flex justify-between border-t pt-3 text-lg font-bold">
          <span>{t.total}</span>
          <span>TSh {total.toLocaleString("en-US")}</span>
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <label className="label" htmlFor="name">{t.name}</label>
          <input id="name" name="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="phone">{t.phone}</label>
          <input id="phone" name="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder={t.phoneHint} value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="office_id">{t.office}</label>
          <select id="office_id" name="office_id" className="input" value={office} onChange={(e) => setOffice(e.target.value)} required>
            <option value="">{t.chooseOffice}</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="delivery_note">{t.deliveryNote}</label>
          <input id="delivery_note" name="delivery_note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">{t.pay}</h2>
        {(["lipa", "cash"] as const).map((m) => (
          <label key={m} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${pay === m ? "border-orange-600 bg-orange-50" : "border-stone-200"}`}>
            <input type="radio" name="payment_method" value={m} checked={pay === m} onChange={() => setPay(m)} className="h-4 w-4 accent-orange-700" />
            <span>{m === "lipa" ? t.payLipa : t.payCash}</span>
          </label>
        ))}
        <div className="pt-2">
          <label className="label" htmlFor="notes">{t.notes}</label>
          <input id="notes" name="notes" className="input" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </div>
      </section>

      {state.retry && (
        <p role="status" className="text-sm text-stone-600">
          {(state.n ?? 1) > RETRY_DELAYS_S.length ? t.retryGiveUp : fill(t.retrying, { n: state.n ?? 1 })}
        </p>
      )}
      {state.error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn w-full text-lg">{submitLabel}</SubmitButton>
    </form>
  );
}
