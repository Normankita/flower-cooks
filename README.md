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
- **Home delivery (migration 0004):** a "🏠 Nyumbani" place in the dropdown. "Are you at home?" → one tap uses the phone GPS; otherwise paste a Google Maps / WhatsApp location link; a landmark description is always required. Coordinates must be inside Tanzania; pasted links are limited to known map hosts (the cook taps them). The cook controls it per cycle in *Mipangilio* (on/off, max stops, max km from the kitchen, kitchen position); the settings carry over to the next cycle. Delivery is free (no fee logic yet). Distances are **straight-line**, not road distance. Customer locations are erased 30 days after the order (done when a new cycle is created). Admin *Uletaji* has a "Nyumbani" section ordered nearest-first with 🧭 Nenda (Google Maps navigation) and a multi-stop "Anza safari" link.

**Cook admin** (`/admin`, PIN login)
- **Muhtasari:** cycle status, portions vs capacity, cooking plan (portions, kg rice, kg meat/chicken), money split paid / reported / unpaid, ready-made WhatsApp messages (open, reminder, last call).
- **Oda:** all orders, approve/decline late requests, mark delivered/paid/cancelled, add orders received by WhatsApp or phone.
- **Uletaji:** delivery sheet grouped by office with "amount to collect", review-request WhatsApp links, and **debts across all cycles** with reminder links.
- **Export (CSV, opens in Excel/Sheets):** *Oda* page → all orders (all cycles) or just the selected cycle; *Uletaji* → debts across all cycles. Routes: `/admin/export/orders[?c=<cycle id>]`, `/admin/export/debts` (admin-only).
- **Mipangilio:** cycle times, capacity, Lipa Namba, menu & prices & kg-per-portion, offices.

## Setup
1. Create a Supabase project. Run every file in `supabase/migrations/` **in order** (0001, 0002, 0003, …) in the SQL editor (or `supabase db push`).
2. `cp .env.example .env.local` and fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PIN`, `ADMIN_SESSION_SECRET` (`openssl rand -hex 32`), `NEXT_PUBLIC_SITE_URL`.
3. `npm install && npm run dev` → open `/admin`, log in, go to **Mipangilio** (set menu prices, offices, Lipa Namba), then **Muhtasari → + Mzunguko mpya**.
4. Deploy to Vercel and add the same env vars.

Security model: all DB access is server-side with the service-role key; RLS is enabled on every table with no public policies, so the anon key reads nothing. Never expose the service-role key to the browser.

## Weekly routine
Saturday: **+ Mzunguko mpya** → copy the opening message → post in office WhatsApp groups. Wed/Thu: send the reminders.
Thursday night: the Muhtasari page is the cooking & shopping list. Friday: use **Uletaji**; tap *Imeletwa* / *Amelipa*; send review links.

## Known limits / next steps
- **Pay by phone (AzamPay USSD push, migration 0005):** the order page offers "Lipa kwa simu" (network auto-detected from the number, customer can change it). The order is marked paid **only by AzamPay's callback** at `POST /api/azampay/callback/<AZAMPAY_CALLBACK_SECRET>`: secret in the path (constant-time check, 404 otherwise), optional callback password, matched by our own `externalId`, exact amount match, one-way idempotent status changes (a duplicate or late-failure callback can never double-credit or undo a payment), raw callbacks logged in `payment_callbacks`. A checkout timeout is treated as "unknown", never as failure. Max 1 waiting attempt per order and 3 attempts/hour. The manual Lipa Namba + transaction-ID flow stays as the fallback. Env: `AZAMPAY_ENV, AZAMPAY_APP_NAME, AZAMPAY_CLIENT_ID, AZAMPAY_CLIENT_SECRET, AZAMPAY_API_KEY (the portal's "Token"), AZAMPAY_AUTH_URL, AZAMPAY_CHECKOUT_URL, AZAMPAY_CALLBACK_SECRET` (+ optional `AZAMPAY_CALLBACK_PASSWORD`). Sandbox → live needs AzamPay KYC approval and live credentials/URLs.
- **Confirm payments from pasted SMS (no gateway needed):** *Oda* → "📩 Thibitisha malipo kwa SMS". The cook pastes the payment confirmation messages from her phone; the app finds each customer's reported transaction ID, checks the **received** amount (balances are ignored) and shows a preview. Only clean matches are pre-ticked; wrong amounts need an explicit tick; a reference claimed by two orders, or already used on a paid order, is blocked. Matching is re-done on the server on confirm; nothing is stored from the pasted text. SMS formats of the networks are approximated, so the cook always reviews before confirming.
- **Lipa Namba card & pay-later (migration 0006):** the order page shows the Lipa Namba big with a copy button, the account name (set per cycle in *Mipangilio → Jina la akaunti*), an accepted-networks line, and an "Onyesha QR" button that only loads `public/lipa-qr.png` when tapped. The QR belongs to one number (`LIPA_QR_NUMBER`): if the cycle's Lipa Namba is changed, the QR is hidden automatically. For paying later, the phone that placed the order remembers its order ids (localStorage) and the home page shows "Oda yako ya wiki hii → Lipa sasa" (status comes from the server by id; **no lookup by phone number**), and the cook's "Kumbusha" WhatsApp debt messages include a direct link to each unpaid order.
- **(Older) payments are verified by the cook** (customer enters the transaction ID, the cook confirms from the SMS). Phase 2: Selcom checkout/USSD-push + webhook to auto-mark paid (needs merchant API credentials from Selcom; follow their current docs).
- **Keep-alive:** `GET /api/health` runs a trivial query; `.github/workflows/keep-alive.yml` calls it every 2 days so the free Supabase project doesn't pause. Set the GitHub variable `HEALTH_URL` (and optionally secret `HEALTH_TOKEN` + the same env var in the app).
- Capacity check is not atomic (fine at ~20 customers; move into a Postgres function if volume grows).
- Admin auth is a shared PIN (use a 6+ digit PIN). **Brute-force lockout:** 5 wrong PINs from one IP within 30 minutes blocks that IP for 30 minutes (stored as a keyed hash in `login_attempts`, migration 0003); a correct login clears the count. To unlock someone early: `delete from login_attempts;` in the SQL editor. Shared mobile-carrier IPs mean a lock can affect others on the same IP, which is why it is temporary. Upgrade to Supabase Auth if more staff are added.
- **Getting into the admin:** customer pages have a discreet "🔒 Jikoni" footer link, and the admin can be installed as its own home-screen app ("Jiko Admin", lock-badged icon, opens straight at `/admin`; manifest at `/api/admin-manifest`).
- Not yet: standing/recurring orders, automated WhatsApp/SMS sending, PWA install icons, review display on the order page.

## Checks
`npm run lint` · `npm run build` · `node --experimental-strip-types scripts/unit.mts` · `node scripts/check-sql.mjs`
