-- Biriani Orders — initial schema
-- All access goes through the Next.js server using the service-role key.
-- RLS is enabled on every table with NO public policies, so the anon key can read nothing.

create extension if not exists pgcrypto;

create table offices (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort int not null default 0
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,            -- normalized: 255XXXXXXXXX
  name text not null,
  office_id uuid references offices(id) on delete set null,
  created_at timestamptz not null default now()
);

-- An "order cycle": one cooking day with an order window.
create table cycles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,         -- regular cutoff (e.g. Thursday 20:00)
  delivery_at timestamptz not null,       -- e.g. Friday 13:00
  capacity int not null default 60 check (capacity > 0),   -- max portions
  lipa_namba text,                        -- Selcom Lipa Namba shown to customers
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price int not null check (price >= 0),  -- TZS
  rice_kg numeric(5,2) not null default 0.25,    -- per portion (cooking planner)
  protein_kg numeric(5,2) not null default 0.20, -- meat/chicken per portion
  active boolean not null default true,
  sort int not null default 0
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references cycles(id) on delete cascade,
  customer_id uuid not null references customers(id),
  office_id uuid references offices(id) on delete set null,
  delivery_note text,
  notes text,
  status text not null default 'confirmed'
    check (status in ('confirmed','late_request','declined','delivered','cancelled')),
  payment_method text not null default 'lipa' check (payment_method in ('lipa','cash')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','reported','paid')),
  payment_ref text,                       -- transaction ref reported by customer / entered by admin
  total int not null default 0,
  review_token uuid not null default gen_random_uuid() unique,
  delivered_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index orders_cycle_idx on orders(cycle_id);
create index orders_customer_idx on orders(customer_id);

create table order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_id uuid not null references menu_items(id),
  qty int not null check (qty > 0),
  unit_price int not null check (unit_price >= 0)
);
create index order_lines_order_idx on order_lines(order_id);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

alter table offices enable row level security;
alter table customers enable row level security;
alter table cycles enable row level security;
alter table menu_items enable row level security;
alter table orders enable row level security;
alter table order_lines enable row level security;
alter table reviews enable row level security;

-- Seed (placeholders — edit in the admin Settings page)
insert into offices (name, sort) values ('Ofisi 1', 1), ('Ofisi 2', 2), ('Ofisi 3', 3);
insert into menu_items (name, price, sort) values
  ('Biriani ya Nyama', 8000, 1),
  ('Biriani ya Kuku', 8000, 2);
