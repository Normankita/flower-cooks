import { callbackPasswordOk, callbackSecretOk } from "@/lib/azampay";
import { parseCallback } from "@/lib/azampay-callback";
import { applyCallback } from "@/lib/payments-db";

export const dynamic = "force-dynamic";

/**
 * AzamPay payment callback: POST /api/azampay/callback/<AZAMPAY_CALLBACK_SECRET>
 * Protection: secret in the path (constant-time compare; 404 otherwise so the route looks absent), optional callback
 * password, our own external id lookup, exact amount match, one-way idempotent status changes (see applyCallback).
 */
export async function POST(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  if (!callbackSecretOk(secret)) return new Response("Not found", { status: 404 });

  let body: unknown;
  const text = await req.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = Object.fromEntries(new URLSearchParams(text)); // tolerate form-encoded bodies
  }

  const parsed = parseCallback(body);
  if (!callbackPasswordOk(parsed?.password ?? null)) return new Response("Unauthorized", { status: 401 });

  try {
    const outcome = await applyCallback(parsed, body);
    return Response.json({ ok: true, outcome });
  } catch (e) {
    console.error("azampay callback failed:", e instanceof Error ? e.message : e);
    return new Response("Server error", { status: 500 }); // let AzamPay retry
  }
}

// Anything else on this URL: pretend it doesn't exist.
export const GET = () => new Response("Not found", { status: 404 });
