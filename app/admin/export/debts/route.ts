import { requireAdmin } from "@/lib/auth";
import { DbUnavailableError } from "@/lib/db-error";
import { debtsCsv, fetchOrdersForExport } from "@/lib/export";
import { csvResponse } from "../csv-response";

export const dynamic = "force-dynamic";

/** GET /admin/export/debts → delivered-but-unpaid orders across all cycles. */
export async function GET() {
  await requireAdmin();
  try {
    const orders = await fetchOrdersForExport({ debtsOnly: true });
    return csvResponse(debtsCsv(orders), "madeni");
  } catch (e) {
    if (e instanceof DbUnavailableError) return new Response("Tatizo la mtandao. Jaribu tena.", { status: 503 });
    throw e;
  }
}
