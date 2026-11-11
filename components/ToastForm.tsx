"use client";

import { useToast } from "./Toaster";
import type { ActionResult } from "@/lib/result";

/**
 * A <form> that runs a server action and reports the outcome as a toast.
 * Actions return { ok, error? }; `success` is shown when ok. useFormStatus (SubmitButton) still works inside.
 */
export default function ToastForm({
  action,
  success,
  errorText = "Imeshindikana. Jaribu tena.",
  className,
  children,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  success?: string;
  errorText?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { toast } = useToast();
  return (
    <form
      className={className}
      action={async (fd) => {
        try {
          const r = await action(fd);
          if (r.ok) {
            if (success) toast(success, "success");
          } else {
            toast(r.error ?? errorText, "error");
          }
        } catch (e) {
          // Let Next's redirect/notFound signals through; anything else is a failed request.
          const digest = (e as { digest?: string })?.digest ?? "";
          if (digest.startsWith("NEXT_")) throw e;
          toast(errorText, "error");
        }
      }}
    >
      {children}
    </form>
  );
}
