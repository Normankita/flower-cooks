/** Normalize a Tanzanian mobile number to 255XXXXXXXXX, or null if invalid. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[^\d]/g, "");
  if (d.startsWith("255")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  if (!/^[67]\d{8}$/.test(d)) return null;
  return "255" + d;
}

export function displayPhone(p: string): string {
  return p.startsWith("255") ? "0" + p.slice(3) : p;
}
