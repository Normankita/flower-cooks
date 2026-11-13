"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendReminderNow } from "@/app/admin/actions";
import { useToast } from "./Toaster";

/** One reminder (Wed / Thu / Fri): shows who would get it and the text, and sends it on the cook's confirmation. */
export default function ReminderPanel({
  kind,
  title,
  when,
  smsReady,
  planned,
  segments,
  sample,
  reason,
}: {
  kind: "wed" | "thu" | "fri";
  title: string;
  when: string;
  smsReady: boolean;
  planned: number;
  segments: number;
  sample?: string;
  reason?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [showText, setShowText] = useState(false);

  const send = () => {
    if (!window.confirm(`Tuma SMS kwa watu ${planned} (takriban SMS ${segments})?`)) return;
    start(async () => {
      const r = await sendReminderNow(kind, false);
      if (!r.ok) toast(r.reason ?? "Imeshindikana.", "error");
      else if (r.failed > 0) toast(`Zimetumwa ${r.sent}, zimeshindwa ${r.failed}. Bonyeza tena kujaribu zilizoshindwa.`, "error");
      else toast(`SMS ${r.sent} zimetumwa ✓`, "success");
      router.refresh();
    });
  };

  return (
    <section className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-stone-500">{when}</p>
        </div>
        {reason ? (
          <span className="badge bg-stone-200 text-stone-700">Haipatikani</span>
        ) : (
          <span className="badge bg-orange-100 text-orange-800">{planned} watapokea</span>
        )}
      </div>
      {reason && <p className="text-sm text-stone-600">{reason}</p>}
      {!reason && (
        <>
          <p className="text-sm text-stone-600">
            SMS zitakazotumwa: ~{segments} (hutegemea urefu wa ujumbe).
          </p>
          {sample && (
            <div>
              <button type="button" className="text-xs text-orange-800 underline" onClick={() => setShowText((s) => !s)}>
                {showText ? "Ficha ujumbe" : "Angalia ujumbe"}
              </button>
              {showText && <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-stone-50 p-2 font-sans text-xs text-stone-700">{sample}</pre>}
            </div>
          )}
          <button type="button" className="btn btn-sm" onClick={send} disabled={pending || planned === 0 || !smsReady}>
            {pending ? "Inatuma…" : kind === "fri" ? `📣 Tuma “Tunakuja” (${planned})` : `Tuma sasa (${planned})`}
          </button>
          {!smsReady && <p className="text-xs text-red-700">SMS haijawekwa bado (NEXTSMS_* kwenye mipangilio ya seva).</p>}
        </>
      )}
    </section>
  );
}
