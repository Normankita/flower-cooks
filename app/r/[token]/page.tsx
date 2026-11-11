import SubmitButton from "@/components/SubmitButton";
import ToastForm from "@/components/ToastForm";
import { db } from "@/lib/supabase";
import { getLang, strings } from "@/lib/i18n";
import { submitReview } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { token } = await params;
  const lang = getLang((await searchParams).lang);
  const t = strings(lang);
  if (!/^[0-9a-f-]{36}$/i.test(token)) return <main className="p-6">{t.notFound}</main>;

  const { data: order } = await db()
    .from("orders")
    .select("id,status,customers(name),reviews(rating)")
    .eq("review_token", token)
    .maybeSingle();
  if (!order) return <main className="p-6">{t.notFound}</main>;

  const reviewed = Array.isArray(order.reviews) ? order.reviews.length > 0 : !!order.reviews;

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-extrabold text-orange-800">
        <span className="float text-3xl" aria-hidden>🍛</span> {t.rateTitle}
      </h1>
      {order.status !== "delivered" ? (
        <p className="card">{t.rateNotYet}</p>
      ) : reviewed ? (
        <p className="card text-center text-lg font-medium">{t.rateThanks}</p>
      ) : (
        <ToastForm action={submitReview} success={t.rateThanks} errorText={t.errToast} className="card space-y-4">
          <p className="text-stone-600">{t.rateBody}</p>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="lang" value={lang} />
          <div className="flex justify-between gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex-1 cursor-pointer">
                <input type="radio" name="rating" value={n} required className="peer sr-only" />
                <span className="block rounded-2xl border border-white/90 bg-white/65 py-3 text-center text-xl shadow-sm transition active:scale-95 peer-checked:scale-105 peer-checked:border-transparent peer-checked:bg-linear-to-br peer-checked:from-orange-500 peer-checked:to-red-600 peer-checked:text-white peer-checked:shadow-lg peer-focus-visible:ring-2 peer-focus-visible:ring-orange-400">
                  {n}★
                </span>
              </label>
            ))}
          </div>
          <div>
            <label className="label" htmlFor="comment">{t.rateComment}</label>
            <textarea id="comment" name="comment" rows={3} maxLength={500} className="input" />
          </div>
          <SubmitButton className="btn w-full">{t.rateSend}</SubmitButton>
        </ToastForm>
      )}
    </main>
  );
}
