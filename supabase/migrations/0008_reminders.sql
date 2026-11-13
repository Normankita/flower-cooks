-- Reminders (SMS now, WhatsApp one-tap helper): consent + a send log that makes sends idempotent.

-- Customers: explicit opt-in to SMS (default OFF) and a secret token for the unsubscribe link in every SMS.
alter table customers
  add column sms_opt_in boolean not null default false,
  add column sms_opt_in_at timestamptz,
  add column unsub_token uuid not null default gen_random_uuid() unique;

-- One row per (cycle, customer, channel, kind): the unique index means a reminder can never go out twice to the same
-- person for the same cycle, even if the scheduled job runs twice. 'test' sends are exempt.
create table message_log (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  channel text not null check (channel in ('sms', 'whatsapp')),
  kind text not null check (kind in ('wed', 'thu', 'fri', 'test')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider_ref text,
  error text,
  created_at timestamptz not null default now()
);
create unique index message_log_once_idx on message_log (cycle_id, customer_id, channel, kind) where kind <> 'test';
create index message_log_cycle_idx on message_log (cycle_id, created_at desc);
alter table message_log enable row level security;
