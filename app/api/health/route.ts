import { timingSafeEqual } from "crypto";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function tokenOk(req: Request): boolean {
  const expected = process.env.HEALTH_TOKEN;
  if (!expected) return true; // token is optional
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Runs a trivial query so the free Supabase project counts as active. Reveals nothing but ok/not ok. */
export async function GET(req: Request) {
  if (!tokenOk(req)) return Response.json({ ok: false }, { status: 401, headers });
  try {
    const { error } = await db().from("offices").select("id").limit(1);
    if (error) throw error;
    return Response.json({ ok: true }, { headers });
  } catch (e) {
    console.error("health check failed:", e instanceof Error ? e.message : e);
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
