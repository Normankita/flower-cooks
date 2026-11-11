import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE = "bo_admin";
const MAX_AGE = 30 * 24 * 3600; // 30 days

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("ADMIN_SESSION_SECRET must be set (16+ chars)");
  return s;
}
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("hex");

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPin(pin: string): boolean {
  const expected = process.env.ADMIN_PIN;
  if (!expected) throw new Error("ADMIN_PIN must be set");
  return safeEqual(pin, expected);
}

export async function createSession() {
  const exp = String(Date.now() + MAX_AGE * 1000);
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const c = (await cookies()).get(COOKIE)?.value;
  if (!c) return false;
  const [exp, sig] = c.split(".");
  if (!exp || !sig || !safeEqual(sig, sign(exp))) return false;
  return Number(exp) > Date.now();
}

/** Call at the top of every admin page AND every admin server action. */
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}
