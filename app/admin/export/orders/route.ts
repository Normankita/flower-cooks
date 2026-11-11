import { requireAdmin } from "@/lib/auth";
import { DbUnavailableError } from "@/lib/db-error";
import { fetchOrdersForExport, ordersCsv } from "@/lib/export";
import { csvResponse } from "../csv-response";

export const dynamic = "force-dynamic";

/** GET /admin/export/orders           → every order, all cycles
 *  GET /admin/export/orders?c=<uuid>  → one cycle */
export async function GET(req: Request) {
  await requireAdmin(); // route handlers are not covered by the panel layout guard
  const c = new URL(req.url).searchParams.get("c") ?? "";
  const cycleId = /^[0-9a-f-]{36}$/i.test(c) ? c : undefined;
  try {
    const orders = await fetchOrdersForExport({ cycleId });
    return csvResponse(ordersCsv(orders), cycleId ? "oda-mzunguko" : "oda-zote");
  } catch (e) {
    if (e instanceof DbUnavailableError) return new Response("Tatizo la mtandao. Jaribu tena.", { status: 503 });
    throw e;
  }
}
