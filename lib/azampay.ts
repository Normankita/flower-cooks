import { timingSafeEqual } from "crypto";
import type { Network } from "./mobile-network";

// AzamPay client (server-only). Endpoints and fields were confirmed against the AzamPay SANDBOX
// (token: POST {AUTH}/AppRegistration/GenerateToken, checkout: POST {CHECKOUT}/azampay/mno/checkout).

const env = (k: string) => (process.env[k] ?? "").trim().replace(/^["']+|["']+$/g, "");

export const azampayConfigured = () =>
  !!(env("AZAMPAY_APP_NAME") && env("AZAMPAY_CLIENT_ID") && env("AZAMPAY_CLIENT_SECRET") && env("AZAMPAY_AUTH_URL") && env("AZAMPAY_CHECKOUT_URL") && env("AZAMPAY_CALLBACK_SECRET"));

/** Compare the secret in the callback URL with ours, in constant time. */
export function callbackSecretOk(given: string): boolean {
  const want = env("AZAMPAY_CALLBACK_SECRET");
  if (!want || want.length < 16) return false; // never accept callbacks with a missing/weak secret
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** If a callback password is configured AND the callback carries one, they must match. */
export function callbackPasswordOk(given: string | null): boolean {
  const want = env("AZAMPAY_CALLBACK_PASSWORD");
  if (!want || given === null) return true; // nothing to compare (the URL secret is the main protection)
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

let cached: { token: string; expMs: number } | null = null;

async function getToken(force = false): Promise<string> {
  if (!force && cached && cached.expMs - Date.now() > 5 * 60_000) return cached.token;
  const res = await fetch(`${env("AZAMPAY_AUTH_URL").replace(/\/$/, "")}/AppRegistration/GenerateToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appName: env("AZAMPAY_APP_NAME"), clientId: env("AZAMPAY_CLIENT_ID"), clientSecret: env("AZAMPAY_CLIENT_SECRET") }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = (await res.json().catch(() => null)) as { data?: { accessToken?: string; expire?: string }; success?: boolean } | null;
  const token = j?.data?.accessToken;
  if (!res.ok || !token) throw new Error(`AzamPay token request failed (HTTP ${res.status})`);
  const exp = Date.parse(j?.data?.expire ?? "");
  cached = { token, expMs: Number.isFinite(exp) ? exp : Date.now() + 30 * 60_000 };
  return token;
}

export type CheckoutResult =
  | { kind: "accepted"; transactionId: string; message: string }
  | { kind: "rejected"; message: string } // AzamPay said no: nothing was sent to the customer's phone
  | { kind: "unknown"; reason: string }; // timeout / network: the push MAY have been sent, so do not retry blindly

/**
 * Ask AzamPay to send a USSD push to the customer's phone. The sandbox sometimes takes 25+ seconds or never answers;
 * a timeout therefore means "unknown", not "failed" — the callback may still arrive.
 */
export async function azampayCheckout(p: { phone: string; amount: number; externalId: string; network: Network }): Promise<CheckoutResult> {
  const body = JSON.stringify({
    accountNumber: p.phone,
    additionalProperties: {},
    amount: String(p.amount),
    currency: "TZS",
    externalId: p.externalId,
    provider: p.network,
  });
  const url = `${env("AZAMPAY_CHECKOUT_URL").replace(/\/$/, "")}/azampay/mno/checkout`;

  for (let attempt = 0; attempt < 2; attempt++) {
    let token: string;
    try {
      token = await getToken(attempt > 0);
    } catch (e) {
      return { kind: "rejected", message: e instanceof Error ? e.message : "token error" }; // nothing was sent yet
    }
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const key = env("AZAMPAY_API_KEY");
      if (key) headers["X-API-Key"] = key;
      const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(45_000) });
      if (res.status === 401 && attempt === 0) continue; // token rejected: get a fresh one once and retry (safe: 401 = not processed)
      const j = (await res.json().catch(() => null)) as { success?: boolean; transactionId?: string; message?: string } | null;
      if (res.ok && j?.success && j.transactionId && j.transactionId !== "null") {
        return { kind: "accepted", transactionId: j.transactionId, message: j.message ?? "" };
      }
      return { kind: "rejected", message: j?.message || `AzamPay refused the request (HTTP ${res.status})` };
    } catch (e) {
      return { kind: "unknown", reason: e instanceof Error ? e.name : "network" };
    }
  }
  return { kind: "rejected", message: "AzamPay authorization failed" };
}
