import { isNetworkMessage } from "./db-error";

/** Returned by server actions used through <ToastForm>; the client shows a toast from it. */
export type ActionResult = { ok: boolean; error?: string };

export const OK: ActionResult = { ok: true };
export const fail = (error: string): ActionResult => ({ ok: false, error });

/** Turn a Supabase write error (or null) into an ActionResult with a Kiswahili message. */
export function fromDb(error: { message: string } | null): ActionResult {
  if (!error) return OK;
  return fail(
    isNetworkMessage(error.message)
      ? "Tatizo la mtandao. Hakijahifadhiwa — jaribu tena."
      : "Imeshindikana kuhifadhi. Jaribu tena.",
  );
}
