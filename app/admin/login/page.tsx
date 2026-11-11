import { loginAction } from "../actions";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
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
          <input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" className="input text-center text-xl tracking-[0.4em]" required autoFocus />
        </div>
        {e && <p role="alert" className="rounded-xl bg-red-50/90 px-3 py-2 text-center text-sm text-red-700">PIN si sahihi.</p>}
        <SubmitButton className="btn w-full">Ingia</SubmitButton>
      </form>
    </main>
  );
}
