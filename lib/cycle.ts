import type { Cycle } from "./types";

export type CycleMode = "none" | "not_yet" | "open" | "late" | "closed";

/**
 * none: no cycle · not_yet: before opens_at · open: before cutoff
 * late: after cutoff but before delivery (late requests) · closed: manually closed or delivery time has passed
 */
export function cycleMode(c: Pick<Cycle, "status" | "opens_at" | "closes_at" | "delivery_at"> | null, now = new Date()): CycleMode {
  if (!c) return "none";
  if (c.status === "closed") return "closed";
  if (now < new Date(c.opens_at)) return "not_yet";
  if (now < new Date(c.closes_at)) return "open";
  if (now < new Date(c.delivery_at)) return "late";
  return "closed";
}
