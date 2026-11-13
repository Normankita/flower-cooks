"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SubmitButton from "./SubmitButton";
import ToastForm from "./ToastForm";
import { fill, type Dict } from "@/lib/i18n";
import { detectNetwork, NETWORK_LABEL, type Network } from "@/lib/mobile-network";
import { normalizePhone } from "@/lib/phone";
import { startPayment } from "@/app/actions";

const WINDOW_S = 180;

/** Shown while a USSD push is waiting for the customer's PIN: counts up and re-checks the order every 4 seconds. */
function Waiting({ t, ageMs }: { t: Dict; ageMs: number }) {
  const router = useRouter();
  const [secs, setSecs] = useState(Math.floor(ageMs / 1000));
  useEffect(() => {
    const tick = setInterval(() => setSecs((s) => s + 1), 1000);
    const poll = setInterval(() => router.refresh(), 4000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [router]);
  return (
    <div className="space-y-2 rounded-2xl bg-orange-100/60 p-4 text-center" role="status">
      <div className="text-3xl" aria-hidden>📲</div>
      <p className="font-medium">{t.payWaiting}</p>
      <p className="flex items-center justify-center gap-2 text-sm text-stone-600">
        <span className="spinner" aria-hidden /> {fill(t.payWaitingSecs, { s: Math.min(secs, WINDOW_S) })}
      </p>
    </div>
  );
}

export default function PayByPhone({
  orderId,
  lang,
  t,
  total,
  defaultPhone,
  defaultNetwork,
  waitingAgeMs,
  lastStatus,
}: {
  orderId: string;
  lang: string;
  t: Dict;
  total: number;
  /** customer's number in 07XX… form */
  defaultPhone: string;
  defaultNetwork: Network | null;
  /** age of the attempt that is still waiting for the PIN, or null */
  waitingAgeMs: number | null;
  /** how the most recent finished attempt ended (shown above the form) */
  lastStatus: "failed" | "expired" | null;
}) {
  const [phone, setPhone] = useState(defaultPhone);
  const [network, setNetwork] = useState<Network | "">(defaultNetwork ?? "");

  if (waitingAgeMs !== null) return <Waiting t={t} ageMs={waitingAgeMs} />;

  return (
    <div className="space-y-3">
      <div>
        <div className="font-medium">📲 {t.payByPhone}</div>
        <p className="text-sm text-stone-600">{t.payByPhoneHint}</p>
      </div>
      {lastStatus === "expired" && <p role="alert" className="rounded-xl bg-amber-100/80 p-2.5 text-sm text-amber-800">{t.payExpired}</p>}
      {lastStatus === "failed" && <p role="alert" className="rounded-xl bg-red-50/90 p-2.5 text-sm text-red-800">{t.payFailedPrev}</p>}
      <ToastForm action={startPayment} success={t.paySent} errorText={t.errToast} className="space-y-3">
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="lang" value={lang} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="pay_phone">{t.payPhoneLabel}</label>
            <input
              id="pay_phone"
              name="pay_phone"
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                const d = detectNetwork(normalizePhone(e.target.value) ?? "");
                if (d) setNetwork(d); // follow the number, but the customer can still override
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor="network">{t.payNetworkLabel}</label>
            <select id="network" name="network" className="input" required value={network} onChange={(e) => setNetwork(e.target.value as Network | "")}>
              <option value="">{t.payNetworkChoose}</option>
              {(Object.keys(NETWORK_LABEL) as Network[]).map((n) => (
                <option key={n} value={n}>{NETWORK_LABEL[n]}</option>
              ))}
            </select>
          </div>
        </div>
        <SubmitButton className="btn w-full">{fill(t.payPushBtn, { amount: "TSh " + total.toLocaleString("en-US") })}</SubmitButton>
        <p className="text-center text-xs text-stone-500">{t.paySlow}</p>
      </ToastForm>
    </div>
  );
}
