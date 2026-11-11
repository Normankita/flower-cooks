import { loginAction } from "../actions";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <form action={loginAction} className="card space-y-4">
        <h1 className="text-xl font-bold">🍛 Ingia</h1>
        <div>
          <label className="label" htmlFor="pin">PIN</label>
          <input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="current-password" className="input" required autoFocus />
        </div>
        {e && <p className="text-sm text-red-700">PIN si sahihi.</p>}
        <SubmitButton className="btn w-full">Ingia</SubmitButton>
      </form>
    </main>
  );
}
