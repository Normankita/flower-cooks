import Link from "next/link";
import SubmitButton from "@/components/SubmitButton";
import ToastForm from "@/components/ToastForm";
import { listReviewsAdmin, type AdminReview } from "@/lib/reviews-db";
import { publicComment, reviewSummary } from "@/lib/standing";
import { fmtDateTime } from "@/lib/time";
import { setReviewHidden } from "../../actions";

export default async function ReviewsAdmin() {
  let list: AdminReview[] = [];
  let problem = "";
  try {
    list = await listReviewsAdmin();
  } catch {
    problem = "Haiwezi kupakia maoni. Je, umeendesha SQL ya migration 0010?";
  }
  const sum = reviewSummary(list.map((r) => ({ rating: r.rating, comment: r.comment, name: r.name, hidden: r.hidden, created_at: r.created_at })));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">⭐ Maoni ya wateja</h1>
        <p className="text-sm text-stone-600">
          Wastani: <b>{sum.avg ? sum.avg.toFixed(1) : "—"}</b> ★ kutoka maoni {sum.count}. Wateja wanaona maoni ya nyota 4–5 pekee, yenye maneno mafupi bila viungo wala namba za simu, na jina la kwanza tu. Unaweza kuficha lolote.
        </p>
      </div>
      {problem && <p className="card text-red-700">{problem}</p>}
      {list.length === 0 && !problem && <p className="card text-sm text-stone-500">Bado hakuna maoni.</p>}
      {list.map((r) => {
        const showable = !r.hidden && r.rating >= 4 && publicComment(r.comment) !== null;
        return (
          <div key={r.id} className={`card space-y-1.5 ${r.hidden ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">
                <span className="text-amber-700">{"★".repeat(r.rating)}</span>
                <span className="text-stone-300">{"★".repeat(5 - r.rating)}</span> · {r.name}
              </div>
              <span className="text-xs text-stone-500">{fmtDateTime(r.created_at)}</span>
            </div>
            {r.comment ? <p className="text-sm">{r.comment}</p> : <p className="text-sm italic text-stone-400">(bila maelezo)</p>}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`badge ${showable ? "bg-green-100 text-green-800" : "bg-stone-200 text-stone-700"}`}>
                {r.hidden ? "Imefichwa" : showable ? "Inaonekana kwa wateja" : r.rating < 4 ? "Haionekani (chini ya nyota 4)" : "Haionekani (hakuna maelezo / kiungo / namba)"}
              </span>
              <ToastForm action={setReviewHidden} success={r.hidden ? "Itaonekana tena" : "Imefichwa"}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="hidden" value={r.hidden ? "0" : "1"} />
                <SubmitButton className="btn-ghost btn-sm">{r.hidden ? "Onyesha tena" : "Ficha"}</SubmitButton>
              </ToastForm>
            </div>
          </div>
        );
      })}
      <Link href="/admin" className="text-sm text-orange-700 underline">← Rudi Muhtasari</Link>
    </div>
  );
}
