import { db } from "./supabase";
import { must } from "./data";
import { reviewSummary, type ReviewLite } from "./standing";

type Row = { rating: number; comment: string | null; hidden: boolean; created_at: string; orders: { customers: { name: string } | null } | null };

/** Public summary: average of all visible ratings + a few recent warm, safe comments (first names only). */
export async function getReviewSummary() {
  const data = must(
    await db().from("reviews").select("rating,comment,hidden,created_at,orders(customers(name))").eq("hidden", false).order("created_at", { ascending: false }).limit(300),
    "reviews",
  );
  const rows: ReviewLite[] = ((data as unknown as Row[] | null) ?? []).map((r) => ({
    rating: r.rating,
    comment: r.comment,
    hidden: r.hidden,
    created_at: r.created_at,
    name: r.orders?.customers?.name ?? "",
  }));
  return reviewSummary(rows);
}

export type AdminReview = { id: string; rating: number; comment: string | null; hidden: boolean; created_at: string; name: string };

/** Everything, newest first (the cook sees low ratings and unsafe comments too, to moderate and to learn from them). */
export async function listReviewsAdmin(limit = 80): Promise<AdminReview[]> {
  const data = must(
    await db().from("reviews").select("id,rating,comment,hidden,created_at,orders(customers(name))").order("created_at", { ascending: false }).limit(limit),
    "reviewsAdmin",
  );
  return ((data as unknown as (Row & { id: string })[] | null) ?? []).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    hidden: r.hidden,
    created_at: r.created_at,
    name: r.orders?.customers?.name ?? "—",
  }));
}
