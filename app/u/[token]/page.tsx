import SubmitButton from "@/components/SubmitButton";
import ToastForm from "@/components/ToastForm";
import { db } from "@/lib/supabase";
import { getLang, strings } from "@/lib/i18n";
import { unsubscribeSms } from "@/app/actions";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Target of the "Kujiondoa" link in every reminder SMS. The token is the only credential; nothing else is shown. */
export default async function Unsubscribe({
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

  const { data } = await db().from("customers").select("sms_opt_in").eq("unsub_token", token).maybeSingle();
  if (!data) return <main className="p-6">{t.notFound}</main>;

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-10">
      <h1 className="text-2xl font-extrabold text-orange-800">🔕 {t.unsubTitle}</h1>
      {data.sms_opt_in ? (
        <ToastForm action={unsubscribeSms} success={t.unsubDone} errorText={t.errToast} className="card space-y-4">
          <p className="text-stone-700">{t.unsubBody}</p>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="lang" value={lang} />
          <SubmitButton className="btn w-full">{t.unsubBtn}</SubmitButton>
        </ToastForm>
      ) : (
        <p className="card font-medium">{t.unsubDone}</p>
      )}
    </main>
  );
}
