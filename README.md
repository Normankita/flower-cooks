# Biriani Orders (MVP)

Weekly order cycle for a home-cooked biriani business: customers order from a link (Saturday → Thursday cutoff),
the cook gets a cooking plan, delivery sheet, payment tracking and review collection.

**Stack:** Next.js 16 (App Router) · Supabase (Postgres) · Vercel. Kiswahili-first, English toggle (`?lang=en`).

## What's in the MVP
**Customers** (`/`)
- One-page order form: items with +/- steppers, office, delivery note, payment method (Lipa Namba / cash). Remembers returning customers on the device.
- Cutoff + capacity: after the cutoff, orders become **late requests** the cook approves/declines. Sold-out when capacity is reached.
- Confirmation page (`/order/[id]`): Lipa Namba + amount, customer can enter their transaction ID, cancel before cutoff, share to WhatsApp.
- Review page (`/r/[token]`): 1–5 stars + comment, only after delivery.

**Cook admin** (`/admin`, PIN login)
- **Muhtasari:** cycle status, portions vs capacity, cooking plan (portions, kg rice, kg meat/chicken), money split paid / reported / unpaid, ready-made WhatsApp messages (open, reminder, last call).
- **Oda:** all orders, approve/decline late requests, mark delivered/paid/cancelled, add orders received by WhatsApp or phone.
- **Uletaji:** delivery sheet grouped by office with "amount to collect", review-request WhatsApp links, and **debts across all cycles** with reminder links.
- **Mipangilio:** cycle times, capacity, Lipa Namba, menu & prices & kg-per-portion, offices.

## Setup
1. Create a Supabase project. Run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push`).
2. `cp .env.example .env.local` and fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PIN`, `ADMIN_SESSION_SECRET` (`openssl rand -hex 32`), `NEXT_PUBLIC_SITE_URL`.
3. `npm install && npm run dev` → open `/admin`, log in, go to **Mipangilio** (set menu prices, offices, Lipa Namba), then **Muhtasari → + Mzunguko mpya**.
4. Deploy to Vercel and add the same env vars.

Security model: all DB access is server-side with the service-role key; RLS is enabled on every table with no public policies, so the anon key reads nothing. Never expose the service-role key to the browser.

## Weekly routine
Saturday: **+ Mzunguko mpya** → copy the opening message → post in office WhatsApp groups. Wed/Thu: send the reminders.
Thursday night: the Muhtasari page is the cooking & shopping list. Friday: use **Uletaji**; tap *Imeletwa* / *Amelipa*; send review links.

## Known limits / next steps
- **Payments are verified by the cook** (customer enters the transaction ID, the cook confirms from the SMS). Phase 2: Selcom checkout/USSD-push + webhook to auto-mark paid (needs merchant API credentials from Selcom; follow their current docs).
- **Keep-alive:** `GET /api/health` runs a trivial query; `.github/workflows/keep-alive.yml` calls it every 2 days so the free Supabase project doesn't pause. Set the GitHub variable `HEALTH_URL` (and optionally secret `HEALTH_TOKEN` + the same env var in the app).
- Capacity check is not atomic (fine at ~20 customers; move into a Postgres function if volume grows).
- Admin auth is a shared PIN (use a 6+ digit PIN). Upgrade to Supabase Auth if more staff are added.
- Not yet: standing/recurring orders, automated WhatsApp/SMS sending, PWA install icons, review display on the order page.

## Checks
`npm run lint` · `npm run build` · `node --experimental-strip-types scripts/unit.mts` · `node scripts/check-sql.mjs`
