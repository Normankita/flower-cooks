"use client";
import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  className = "btn",
  busy = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Keep the spinner on after the action finished (e.g. while navigating away). */
  busy?: boolean;
}) {
  const status = useFormStatus();
  const pending = status.pending || busy;
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${className} relative`}>
      {/* children stay in layout (invisible) so the button doesn't change size while loading */}
      <span className={pending ? "invisible" : "inline-flex items-center gap-2"}>{children}</span>
      {pending && <span className="spinner absolute" role="status" aria-label="Inapakia" />}
    </button>
  );
}
