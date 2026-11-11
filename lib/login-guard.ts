import { createHmac } from "crypto";
import { headers } from "next/headers";
import { db } from "./supabase";
import { LOCK_WINDOW_MS, lockState, type LockState } from "./lockout";

/** Client IP as set by the platform (Vercel overwrites x-forwarded-for; behind your own proxy, make it set one). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return real || fwd || "unknown";
}

/** Keyed hash so raw IP addresses are never stored. */
function ipHash(ip: string): string {
  const key = process.env.ADMIN_SESSION_SECRET ?? "";
  return createHmac("sha256", key).update(ip).digest("hex").slice(0, 32);
}

const OPEN: LockState = { locked: false, failures: 0, left: 5, minutes: 0 };

/**
 * Current lock state for an IP. If the database can't be read (down, or migration 0003 not applied yet) we
 * fail OPEN and log, so the cook is never locked out of her own business by an outage.
 */
export async function getLockState(ip: string): Promise<LockState> {
  try {
    const since = new Date(Date.now() - 2 * LOCK_WINDOW_MS).toISOString(); // lockState anchors on the last failure
    const { data, error } = await db()
      .from("login_attempts")
      .select("failed_at")
      .eq("ip_hash", ipHash(ip))
      .gte("failed_at", since);
    if (error) throw new Error(error.message);
    return lockState((data ?? []).map((r: { failed_at: string }) => new Date(r.failed_at).getTime()));
  } catch (e) {
    console.error("login-guard: could not read attempts (failing open):", e instanceof Error ? e.message : e);
    return OPEN;
  }
}

export async function recordFailure(ip: string): Promise<void> {
  try {
    const sb = db();
    await sb.from("login_attempts").insert({ ip_hash: ipHash(ip) });
    // housekeeping: drop anything older than a day
    await sb.from("login_attempts").delete().lt("failed_at", new Date(Date.now() - 86_400_000).toISOString());
  } catch (e) {
    console.error("login-guard: could not record failure:", e instanceof Error ? e.message : e);
  }
}

export async function clearFailures(ip: string): Promise<void> {
  try {
    await db().from("login_attempts").delete().eq("ip_hash", ipHash(ip));
  } catch (e) {
    console.error("login-guard: could not clear failures:", e instanceof Error ? e.message : e);
  }
}
