/** Animated check (drawn with CSS stroke animation) for the order confirmation. Server component. */
export default function SuccessMark({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg viewBox="0 0 56 56" className={className} fill="none" aria-hidden>
      <circle className="check-circle" cx="28" cy="28" r="26" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" />
      <path className="check-mark" d="M16 29.5l8 8L40 20" stroke="#16a34a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
