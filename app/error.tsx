"use client";

import { useEffect } from "react";

// Next 16: error boundaries receive `retry` (re-fetch + re-render), not `reset`.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-10">
      <h1 className="text-2xl font-extrabold text-orange-800">🍛 Huduma haipatikani kwa sasa</h1>
      <p className="card">
        Kuna tatizo la mtandao. Tafadhali jaribu tena baada ya muda mfupi.
        <br />
        <span className="text-stone-500">There is a network problem. Please try again in a moment.</span>
      </p>
      <button className="btn" onClick={() => retry()}>Jaribu tena / Try again</button>
    </main>
  );
}
