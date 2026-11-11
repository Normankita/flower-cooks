// East Africa Time is UTC+3 all year (no DST).
const OFFSET = 3 * 3600_000;
const TZ = "Africa/Dar_es_Salaam";

/** Next occurrence of weekday `dow` (0=Sun … 6=Sat) at h:min EAT, strictly after `from`. */
export function nextWeekdayEAT(dow: number, h: number, min: number, from = new Date()): Date {
  const s = new Date(from.getTime() + OFFSET);
  const diff = (dow - s.getUTCDay() + 7) % 7;
  let t = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() + diff, h, min) - OFFSET;
  if (t <= from.getTime()) t += 7 * 86400_000;
  return new Date(t);
}

export function fmtDateTime(iso: string | Date, lang: "sw" | "en" = "sw"): string {
  return new Intl.DateTimeFormat(lang === "sw" ? "sw-TZ" : "en-GB", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Value for <input type="datetime-local"> in EAT. */
export function toEATInput(iso: string | Date): string {
  const s = new Date(new Date(iso).getTime() + OFFSET);
  return s.toISOString().slice(0, 16);
}

/** Parse a datetime-local value (interpreted as EAT) to a Date. */
export function parseEATInput(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - OFFSET);
}

export const tzs = (n: number) => "TSh " + n.toLocaleString("en-US");
