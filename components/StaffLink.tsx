import Link from "next/link";

/** Discreet entrance for the cook at the bottom of customer pages. Server component. */
export default function StaffLink({ label }: { label: string }) {
  return (
    <footer className="pb-6 pt-6 text-center">
      <Link href="/admin" className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs text-stone-500 opacity-70 transition hover:bg-(--glass) hover:opacity-100">
        <span aria-hidden>🔒</span> {label}
      </Link>
    </footer>
  );
}
