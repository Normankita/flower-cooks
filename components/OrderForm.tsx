"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import HomeLocation, { type Loc } from "./HomeLocation";
import { MY_ORDERS_KEY } from "./MyOrders";
import SubmitButton from "./SubmitButton";
import { useToast } from "./Toaster";
import { fill, type Dict } from "@/lib/i18n";
import { RETRY_DELAYS_S } from "@/lib/db-error";

type Item = { id: string; name: string; price: number };
type Office = { id: string; name: string };
type State = { error?: string; retry?: boolean; redirectTo?: string; n?: number };

const KEY = "bo_customer";

export default function OrderForm({
  action,
  cycleId,
  items,
  offices,
  lang,
  t,
  submitLabel,
  successText,
  remember = true,
  sticky = true,
  homeEnabled = false,
  homeFull = false,
  homeGps = true,
  smsOptInOffered = false,
}: {
  action: (s: State, fd: FormData) => Promise<State>;
  cycleId: string;
  items: Item[];
  offices: Office[];
  lang: string;
  t: Dict;
  submitLabel: string;
  /** Toast shown when the order was saved, just before navigating to the result page. */
  successText: string;
  remember?: boolean;
  /** Pin the total + submit button to the bottom of the screen (public form on phones). */
  sticky?: boolean;
  /** Offer "deliver to my home" in the places list (the cook switches it per cycle). */
  homeEnabled?: boolean;
  /** Home stops are used up for this cycle: option is shown but disabled. */
  homeFull?: boolean;
  /** Offer the "use my GPS" button (off in the cook's manual-entry form). */
  homeGps?: boolean;
  /** Show the (unticked) "send me reminders by SMS" consent box. Only when SMS is configured. */
  smsOptInOffered?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
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
  const [loc, setLoc] = useState<Loc | null>(null);
  const [link, setLink] = useState("");
  const [smsOpt, setSmsOpt] = useState(false);
  const isHome = office === "home";

  // Returning customers: prefill from this device.
  useEffect(() => {
    if (!remember) return;
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (!s) return;
      /* eslint-disable react-hooks/set-state-in-effect */
      setName(s.name ?? "");
      setPhone(s.phone ?? "");
      setOffice(offices.some((o) => o.id === s.office) || (s.office === "home" && homeEnabled && !homeFull) ? s.office : "");
      if (Number.isFinite(s.loc?.lat) && Number.isFinite(s.loc?.lng)) {
        setLoc({ lat: s.loc.lat, lng: s.loc.lng, acc: s.loc.acc ?? null, saved: true });
      }
      if (typeof s.link === "string") setLink(s.link);
      if (s.sms === true) setSmsOpt(true);
      setNote(s.note ?? "");
      if (s.pay === "cash" || s.pay === "lipa") setPay(s.pay);
      const q: Record<string, number> = {};
      for (const it of items) if (s.qty?.[it.id] > 0) q[it.id] = s.qty[it.id];
      setQty(q);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {}
  }, [remember, offices, items, homeEnabled, homeFull]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdem(crypto.randomUUID());
  }, []);

  // Success: toast, then go to the result page. Failure: toast the message (retry hints stay inline).
  useEffect(() => {
    if (state.redirectTo) {
      if (remember) {
        // remember this order on the device so the home page can offer "pay now" later (see MyOrders)
        try {
          const id = /\/order\/([0-9a-f-]{36})/i.exec(state.redirectTo)?.[1];
          if (id) {
            const list = (JSON.parse(localStorage.getItem(MY_ORDERS_KEY) ?? "[]") as { id: string; cycleId: string; at: number }[]).filter((x) => x.id !== id);
            list.unshift({ id, cycleId, at: Date.now() });
            localStorage.setItem(MY_ORDERS_KEY, JSON.stringify(list.slice(0, 10)));
          }
        } catch {}
      }
      toast(successText, "success");
      router.push(state.redirectTo);
    } else if (state.error && !state.retry) {
      toast(state.error, "error");
    }
  }, [state, toast, router, successText, remember, cycleId]);

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
  const count = items.reduce((s, i) => s + (qty[i.id] ?? 0), 0);
  const bump = (id: string, d: number) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(20, (q[id] ?? 0) + d)) }));

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-4"
      onSubmit={() => {
        clearTimeout(timer.current);
        if (!remember) return;
        try {
          localStorage.setItem(KEY, JSON.stringify({ name, phone, office, note, pay, qty, loc, link, sms: smsOpt }));
        } catch {}
      }}
    >
      <input type="hidden" name="cycle_id" value={cycleId} />
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="idem_key" value={idem} />

      <section className="card space-y-3">
        <h2 className="font-semibold">{t.items}</h2>
        {items.map((it) => {
          const q = qty[it.id] ?? 0;
          return (
            <div
              key={it.id}
              className={`flex items-center justify-between gap-3 rounded-2xl p-2.5 transition-colors ${q > 0 ? "bg-orange-50/80" : ""}`}
            >
              <div>
                <div className="font-medium">{it.name}</div>
                <div className="text-sm text-stone-500">TSh {it.price.toLocaleString("en-US")}</div>
              </div>
              <div className="flex items-center gap-2.5">
                <button type="button" aria-label="-" className="step-btn" onClick={() => bump(it.id, -1)} disabled={q === 0}>
                  −
                </button>
                <span key={q} className="qty-num w-6 text-center text-lg font-bold tabular-nums" aria-live="polite">{q}</span>
                <button type="button" aria-label="+" className="step-btn step-btn-plus" onClick={() => bump(it.id, 1)}>
                  +
                </button>
                <input type="hidden" name={`qty_${it.id}`} value={q} />
              </div>
            </div>
          );
        })}
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
            {homeEnabled && (
              <option value="home" disabled={homeFull}>
                🏠 {t.homeOption}{homeFull ? ` ${t.homeFullTag}` : ""}
              </option>
            )}
          </select>
        </div>
        {isHome && <HomeLocation t={t} allowGps={homeGps} loc={loc} setLoc={setLoc} link={link} setLink={setLink} />}
        <div>
          <label className="label" htmlFor="delivery_note">{isHome ? t.homeNoteLabel : t.deliveryNote}</label>
          <input
            id="delivery_note"
            name="delivery_note"
            className="input"
            placeholder={isHome ? t.homeNoteHint : undefined}
            required={isHome}
            minLength={isHome ? 3 : undefined}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-semibold">{t.pay}</h2>
        {(["lipa", "cash"] as const).map((m) => (
          <label key={m} className="option" data-on={pay === m}>
            <input type="radio" name="payment_method" value={m} checked={pay === m} onChange={() => setPay(m)} className="h-4 w-4 accent-orange-700" />
            <span>{m === "lipa" ? t.payLipa : t.payCash}</span>
          </label>
        ))}
        <div className="pt-2">
          <label className="label" htmlFor="notes">{t.notes}</label>
          <input id="notes" name="notes" className="input" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </div>
      </section>

      {smsOptInOffered && (
        <label className="card flex cursor-pointer items-start gap-3 p-3! text-sm">
          <input type="checkbox" name="sms_opt_in" className="mt-0.5 h-4 w-4 shrink-0 accent-orange-700" checked={smsOpt} onChange={(e) => setSmsOpt(e.target.checked)} />
          <span>{t.smsOptIn}</span>
        </label>
      )}

      {state.retry && (
        <p role="status" className="card text-sm text-stone-700">
          {(state.n ?? 1) > RETRY_DELAYS_S.length ? t.retryGiveUp : fill(t.retrying, { n: state.n ?? 1 })}
        </p>
      )}
      {state.error && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50/90 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <div className={sticky ? "sticky-bar" : ""}>
        <div className={`flex items-center gap-3 ${sticky ? "glass rounded-3xl p-3 pl-4" : ""}`}>
          <div className="flex-1">
            <div className="text-xs text-stone-500">{t.total}{count > 0 ? ` · ${count}` : ""}</div>
            <div key={total} className="tick text-xl font-extrabold tabular-nums">TSh {total.toLocaleString("en-US")}</div>
          </div>
          <SubmitButton className="btn px-6 text-lg" busy={!!state.redirectTo}>{submitLabel}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
