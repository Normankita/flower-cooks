-- Failed admin PIN attempts, per (hashed) client IP. Used to lock an IP out after 5 failures in 30 minutes.
-- IPs are stored as a keyed hash, never raw. Server-only table: RLS on, no policies (service role bypasses RLS).
create table login_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  failed_at timestamptz not null default now()
);
create index login_attempts_ip_idx on login_attempts (ip_hash, failed_at desc);
alter table login_attempts enable row level security;
