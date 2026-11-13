"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { runStandingNow } from "@/app/admin/actions";
import { useToast } from "./Toaster";

/** Creates this cycle's orders from customers' weekly orders (safe to press again; nothing is duplicated). */
export default function StandingNow() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await runStandingNow();
          if (!r.ok) toast(r.reason ?? "Imeshindikana.", "error");
          else {
            const parts = [`mpya ${r.created}`, `zilikuwepo ${r.existing}`];
            if (r.skipped) parts.push(`zimeruka ${r.skipped}`);
            toast(`Oda za kila wiki: ${parts.join(", ")}${r.full ? ` · hazikutosha nafasi ${r.full}` : ""}${r.failed ? ` · zimeshindikana ${r.failed}` : ""}`, r.full || r.failed ? "error" : "success");
          }
          router.refresh();
        })
      }
    >
      {pending ? "Inaweka…" : "🔁 Weka oda za kila wiki sasa"}
    </button>
  );
}
