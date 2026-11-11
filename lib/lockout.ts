export const MAX_FAILURES = 5;
export const LOCK_WINDOW_MS = 30 * 60_000;

export type LockState = {
  locked: boolean;
  /** failed attempts currently counted */
  failures: number;
  /** attempts left before a lock (0 when locked) */
  left: number;
  /** whole minutes until the lock ends (0 when not locked) */
  minutes: number;
};

/**
 * Pure: lock state from failure timestamps (ms since epoch; pass at least the last 2×window).
 *
 * Rule: if `max` failures happened within `window` of the MOST RECENT failure, and that last failure is less than
 * `window` ago, the IP is locked until last failure + window. Anchoring on the last failure (not a rolling window)
 * means an old failure expiring can never lift a lock early. A lock never extends itself: failures are not recorded
 * while locked.
 */
export function lockState(failedAt: number[], now = Date.now(), max = MAX_FAILURES, windowMs = LOCK_WINDOW_MS): LockState {
  const recent = failedAt.filter((t) => now - t < windowMs);
  if (failedAt.length > 0) {
    const last = Math.max(...failedAt);
    if (now - last < windowMs) {
      const burst = failedAt.filter((t) => last - t < windowMs).length;
      if (burst >= max) {
        return { locked: true, failures: burst, left: 0, minutes: Math.max(1, Math.ceil((last + windowMs - now) / 60_000)) };
      }
    }
  }
  return { locked: false, failures: recent.length, left: Math.max(0, max - recent.length), minutes: 0 };
}
