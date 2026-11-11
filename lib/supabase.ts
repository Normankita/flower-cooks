import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "./supabase-url";

let client: SupabaseClient | null = null;

const TIMEOUT_MS = 6000;

/**
 * fetch with a timeout. Reads (GET/HEAD) are retried once; writes are NOT retried here
 * (a retried write could be applied twice) — the order flow uses an idempotency key instead.
 */
const fetchWithTimeout: typeof fetch = async (input, init) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const attempts = method === "GET" || method === "HEAD" ? 2 : 1;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      return await fetch(input, { ...init, signal });
    } catch (e) {
      last = e;
    }
  }
  throw last;
};

/** Server-only client using the service-role key. Never import this in a client component. */
export function db(): SupabaseClient {
  if (client) return client;
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim().replace(/^["']+|["']+$/g, "");
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL (must look like https://<ref>.supabase.co) and SUPABASE_SERVICE_ROLE_KEY must be set",
    );
  }
  client = createClient(url, key, { auth: { persistSession: false }, global: { fetch: fetchWithTimeout } });
  return client;
}
