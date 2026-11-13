// SMS sending (server-only). Provider is chosen by env:
//   NEXTSMS_USERNAME / NEXTSMS_PASSWORD / NEXTSMS_SENDER_ID  → NextSMS (https://messaging-service.co.tz)
//   SMS_PROVIDER=log                                         → development only: logs instead of sending
// NextSMS request/response shapes below follow NextSMS's public gateway format and MUST be confirmed against your
// account with scripts that send one SMS to your own number before this is trusted in production.

const env = (k: string) => (process.env[k] ?? "").trim().replace(/^["']+|["']+$/g, "");

export type SmsProvider = "nextsms" | "log" | "none";

export function smsProvider(): SmsProvider {
  if (env("SMS_PROVIDER") === "log" && process.env.NODE_ENV !== "production") return "log"; // never "pretend-send" in production
  if (env("NEXTSMS_USERNAME") && env("NEXTSMS_PASSWORD") && env("NEXTSMS_SENDER_ID")) return "nextsms";
  return "none";
}
export const smsConfigured = () => smsProvider() !== "none";

export type SendResult = { ok: true; ref: string | null } | { ok: false; error: string };

/** @param to 255XXXXXXXXX */
export async function sendSms(to: string, text: string, reference?: string): Promise<SendResult> {
  const provider = smsProvider();
  if (provider === "none") return { ok: false, error: "SMS not configured" };
  if (!/^255\d{9}$/.test(to)) return { ok: false, error: "invalid phone number" };
  if (provider === "log") {
    console.log(`[sms:log] to=${to} text=${JSON.stringify(text)}`);
    return { ok: true, ref: "log" };
  }

  const base = (env("NEXTSMS_API_URL") || "https://messaging-service.co.tz").replace(/\/$/, "");
  const auth = Buffer.from(`${env("NEXTSMS_USERNAME")}:${env("NEXTSMS_PASSWORD")}`).toString("base64");
  try {
    const res = await fetch(`${base}/api/sms/v1/text/single`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ from: env("NEXTSMS_SENDER_ID"), to, text, ...(reference ? { reference } : {}) }),
      signal: AbortSignal.timeout(20_000),
    });
    const j = (await res.json().catch(() => null)) as {
      messages?: { messageId?: string; status?: { groupId?: number; groupName?: string; name?: string; description?: string } }[];
      message?: string;
    } | null;
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}${j?.message ? `: ${j.message}` : ""}`.slice(0, 200) };
    const m = j?.messages?.[0];
    const group = m?.status?.groupName?.toUpperCase() ?? "";
    // PENDING / DELIVERED / SENT are acceptable; REJECTED / UNDELIVERABLE / EXPIRED are not.
    if (m && /^(PENDING|DELIVERED|SENT|ACCEPTED)/.test(group)) return { ok: true, ref: m.messageId ?? null };
    return { ok: false, error: `${group || "no status"} ${m?.status?.name ?? ""} ${m?.status?.description ?? ""}`.trim().slice(0, 200) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.name : "network" };
  }
}
