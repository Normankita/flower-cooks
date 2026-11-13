-- Gateway payment attempts (AzamPay USSD push first). One order can have several attempts (retries / other network).
-- external_id is what we send the gateway; it is unique so a callback maps to exactly one attempt (idempotency).
-- Server-only table: RLS on, no policies (service role bypasses RLS).
create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  provider text not null,                    -- 'azampay'
  external_id text not null unique,          -- our reference sent to the gateway (<= 128 ASCII chars)
  network text,                              -- Mpesa | Tigo | Airtel | Halopesa
  phone text not null,                       -- 255XXXXXXXXX that received the USSD push
  amount int not null check (amount > 0),    -- TZS
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'expired')),
  provider_ref text,                         -- gateway transaction id
  failure_reason text,
  raw jsonb,                                 -- last callback body, for disputes
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on payments (order_id);
-- At most ONE waiting attempt per order: a double tap can never send two USSD prompts.
create unique index payments_one_pending_idx on payments (order_id) where status = 'pending';
alter table payments enable row level security;

-- Every authenticated callback we receive, as-is. Lets us check the real payload shape, audit, and resolve disputes.
-- outcome: received | no-match | amount-mismatch | ignored | applied | duplicate | failed-attempt
create table payment_callbacks (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  external_id text,
  outcome text not null default 'received',
  body jsonb
);
create index payment_callbacks_ext_idx on payment_callbacks (external_id);
alter table payment_callbacks enable row level security;
