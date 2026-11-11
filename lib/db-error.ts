/** Thrown when the database could not be reached (timeout, DNS, dropped connection) — as opposed to a query error. */
export class DbUnavailableError extends Error {
  constructor(what: string, detail: string) {
    super(`Database unreachable (${what}): ${detail}`);
    this.name = "DbUnavailableError";
  }
}

const NETWORK_RE = /fetch failed|timeout|timed out|aborted|econn|enotfound|eai_again|etimedout|socket|network/i;

/** True if a Supabase/fetch error message looks like a connectivity problem rather than a bad query. */
export function isNetworkMessage(msg: string | undefined | null): boolean {
  return !!msg && NETWORK_RE.test(msg);
}

/** Retry delays (seconds) used by the order form's automatic retry. */
export const RETRY_DELAYS_S = [4, 8, 15, 30, 45, 60];
