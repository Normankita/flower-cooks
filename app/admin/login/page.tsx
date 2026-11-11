import Link from "next/link";
import { loginAction } from "../actions";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string; left?: string; m?: string }> }) {
  const { e, left, m } = await searchParams;
  const locked = e === "locked";
  const mins = Math.min(Math.max(Number(m) || 30, 1), 30);
  const triesLeft = Number(left);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <form action={loginAction} className="card space-y-5 p-6">
        <div className="space-y-1 text-center">
          <div className="float text-5xl" aria-hidden>🍛</div>
          <h1 className="text-xl font-bold text-orange-800">Ingia</h1>
          <p className="text-sm text-stone-500">Weka PIN ya jikoni</p>
        </div>
        <div>
          <label className="label" htmlFor="pin">PIN</label>
          <input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" className="input text-center text-xl tracking-[0.4em]" required autoFocus disabled={locked} />
        </div>
        {locked && (
          <p role="alert" className="rounded-xl bg-red-50/90 px-3 py-2 text-center text-sm text-red-700">
            Umejaribu mara nyingi mno. Subiri dakika {mins} kisha jaribu tena.
          </p>
        )}
        {e === "1" && (
          <p role="alert" className="rounded-xl bg-red-50/90 px-3 py-2 text-center text-sm text-red-700">
            PIN si sahihi.{Number.isFinite(triesLeft) && left !== undefined ? ` Umebakiza majaribio ${triesLeft}.` : ""}
          </p>
        )}
        <SubmitButton className="btn w-full">Ingia</SubmitButton>
      </form>
      <Link href="/" className="mt-4 text-center text-sm text-stone-500 transition hover:text-stone-700">← Rudi kwa wateja</Link>
    </main>
  );
}
