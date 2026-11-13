import { timingSafeEqual } from "crypto";

/** Constant-time string comparison. Refuses empty or short secrets. */
export function secretOk(given: string, want: string, minLength = 16): boolean {
  if (!want || want.length < minLength) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
