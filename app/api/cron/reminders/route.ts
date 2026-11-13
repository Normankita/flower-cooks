import { runReminder } from "@/lib/reminders-db";
import { secretOk } from "@/lib/secret";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // up to 200 SMS, 5 at a time

/**
 * Scheduled reminders: POST /api/cron/reminders?kind=wed|thu[&dry=1]
 * Called by GitHub Actions (.github/workflows/reminders.yml) with "Authorization: Bearer <CRON_SECRET>".
 * Only Wednesday's and Thursday's reminders run from here (Friday's "on our way" is the cook's button), and each only
 * on its own weekday (East Africa Time), so a stray or repeated call is harmless. Idempotent via message_log.
 */
async function handle(req: Request) {
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secretOk(given, (process.env.CRON_SECRET ?? "").trim())) return new Response("Not found", { status: 404 });

  const q = new URL(req.url).searchParams;
  const kind = q.get("kind");
  if (kind !== "wed" && kind !== "thu") return Response.json({ ok: false, reason: "kind must be wed or thu" }, { status: 400 });
  try {
    const res = await runReminder(kind, { dry: q.get("dry") === "1" });
    return Response.json(res, { status: res.ok || res.reason ? 200 : 500 });
  } catch (e) {
    console.error("reminder cron failed:", e instanceof Error ? e.message : e);
    return Response.json({ ok: false, reason: "server error" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
