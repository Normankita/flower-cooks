import { toEATInput } from "@/lib/time";

/** A CSV download named like "oda-zote-2026-11-13.csv" (date in East Africa Time). */
export function csvResponse(body: string, name: string): Response {
  const day = toEATInput(new Date()).slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
