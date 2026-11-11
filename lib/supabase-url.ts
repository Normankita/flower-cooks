/**
 * Clean a SUPABASE_URL env value: strips quotes/whitespace pasted by mistake, adds https:// if missing and
 * drops any path (e.g. "/rest/v1/"). Returns "" when it cannot be turned into a valid URL.
 */
export function normalizeSupabaseUrl(raw: string | undefined | null): string {
  let s = (raw ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    return new URL(s).origin;
  } catch {
    return "";
  }
}
