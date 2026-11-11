/** Instant skeleton while a public page loads data (shown by Next's streaming). */
export default function Loading() {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 py-6" aria-busy="true">
      <div className="skeleton h-10 w-3/4" />
      <div className="skeleton h-5 w-1/2" />
      <div className="skeleton h-24" />
      <div className="skeleton h-56" />
      <div className="skeleton h-40" />
    </main>
  );
}
