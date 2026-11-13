import { getReviewSummary } from "@/lib/reviews-db";
import { fill, type Dict } from "@/lib/i18n";

/** Social proof on the ordering page: average rating + a few recent warm comments. Renders nothing if there is nothing
 *  good to show (fewer than 3 reviews) or if reviews can't be loaded — it must never break the page. Server component. */
export default async function ReviewsCard({ t }: { t: Dict }) {
  let s;
  try {
    s = await getReviewSummary();
  } catch {
    return null;
  }
  if (s.count < 3) return null;
  return (
    <section className="card space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">⭐ {t.reviewsTitle}</h2>
        <span className="badge bg-amber-100 text-amber-800">{s.avg.toFixed(1)} ★ · {fill(t.reviewsCount, { n: s.count })}</span>
      </div>
      {s.recent.map((r, i) => (
        <blockquote key={i} className="rounded-xl bg-(--glass) px-3 py-2 text-sm">
          <span className="text-amber-700" aria-label={`${r.rating} stars`}>{"★".repeat(r.rating)}</span> “{r.text}”
          {r.name && <span className="text-stone-500"> — {r.name}</span>}
        </blockquote>
      ))}
    </section>
  );
}
