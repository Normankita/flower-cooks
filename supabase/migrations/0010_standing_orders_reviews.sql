-- Standing ("same every Friday") orders + review moderation.

-- A customer's repeating order. Controlled through a secret link (/s/<token>): no accounts. Office deliveries only
-- (a home delivery would need the location every week). One active standing order per customer.
create table standing_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  active boolean not null default true,
  office_id uuid references offices(id) on delete set null,
  delivery_note text,
  payment_method text not null default 'lipa' check (payment_method in ('lipa', 'cash')),
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0), -- [{item_id, qty}]; prices come from the menu each week
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index standing_one_active_idx on standing_orders (customer_id) where active;

-- "Skip this week": one row per (standing order, cycle). Prevents re-creating a skipped week.
create table standing_skips (
  standing_id uuid not null references standing_orders(id) on delete cascade,
  cycle_id uuid not null references cycles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (standing_id, cycle_id)
);

alter table standing_orders enable row level security;
alter table standing_skips enable row level security;

-- Orders created from a standing order point back to it (the cook sees a "🔁" badge).
alter table orders add column standing_id uuid references standing_orders(id) on delete set null;

-- Reviews: the cook can hide any review from the public display.
alter table reviews add column hidden boolean not null default false;

-- create_order_atomic (0009) now also stores standing_id.
create or replace function create_order_atomic(
  p_cycle uuid,
  p_mode text,
  p_customer jsonb,
  p_order jsonb,
  p_lines jsonb
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_cycle cycles%rowtype;
  v_key uuid := nullif(p_order->>'idempotency_key', '')::uuid;
  v_qty int;
  v_taken int;
  v_homes int;
  v_cust uuid;
  v_order uuid;
  v_opt boolean := coalesce((p_customer->>'sms_opt_in')::boolean, false);
begin
  if p_mode not in ('open', 'late', 'admin') then
    raise exception 'create_order_atomic: bad mode %', p_mode;
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('ok', false, 'code', 'errItems');
  end if;

  select * into v_cycle from cycles where id = p_cycle for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'errGeneric');
  end if;

  if v_key is not null then
    select o.id into v_order from orders o
      where o.idempotency_key = v_key and exists (select 1 from order_lines l where l.order_id = o.id);
    if v_order is not null then
      return jsonb_build_object('ok', true, 'id', v_order, 'existing', true);
    end if;
    delete from orders where idempotency_key = v_key;
  end if;

  select coalesce(sum((l->>'qty')::int), 0) into v_qty from jsonb_array_elements(p_lines) l;

  if p_mode <> 'admin' and coalesce(p_order->>'delivery_type', 'office') = 'home' then
    if not v_cycle.home_enabled then
      return jsonb_build_object('ok', false, 'code', 'errHomeOff');
    end if;
    if v_cycle.home_max_stops is not null then
      select count(*) into v_homes from orders
        where cycle_id = p_cycle and delivery_type = 'home' and status in ('confirmed', 'delivered');
      if v_homes >= v_cycle.home_max_stops then
        return jsonb_build_object('ok', false, 'code', 'errHomeFull');
      end if;
    end if;
  end if;

  if p_mode = 'open' then
    select coalesce(sum(ol.qty), 0) into v_taken
      from order_lines ol join orders o on o.id = ol.order_id
      where o.cycle_id = p_cycle and o.status in ('confirmed', 'delivered');
    if v_qty > v_cycle.capacity - v_taken then
      return jsonb_build_object('ok', false, 'code', 'errCapacity', 'left', greatest(v_cycle.capacity - v_taken, 0));
    end if;
  end if;

  insert into customers (phone, name, office_id, sms_opt_in, sms_opt_in_at)
  values (
    p_customer->>'phone',
    p_customer->>'name',
    nullif(p_customer->>'office_id', '')::uuid,
    v_opt,
    case when v_opt then now() end
  )
  on conflict (phone) do update set
    name = excluded.name,
    office_id = coalesce(excluded.office_id, customers.office_id),
    sms_opt_in = customers.sms_opt_in or excluded.sms_opt_in,
    sms_opt_in_at = case when excluded.sms_opt_in and not customers.sms_opt_in then now() else customers.sms_opt_in_at end
  returning id into v_cust;

  insert into orders (
    cycle_id, customer_id, office_id, delivery_type, delivery_lat, delivery_lng, delivery_accuracy_m, location_url,
    delivery_note, notes, status, payment_method, total, idempotency_key, standing_id
  ) values (
    p_cycle,
    v_cust,
    nullif(p_order->>'office_id', '')::uuid,
    coalesce(p_order->>'delivery_type', 'office'),
    nullif(p_order->>'delivery_lat', '')::numeric,
    nullif(p_order->>'delivery_lng', '')::numeric,
    nullif(p_order->>'delivery_accuracy_m', '')::int,
    nullif(p_order->>'location_url', ''),
    nullif(p_order->>'delivery_note', ''),
    nullif(p_order->>'notes', ''),
    coalesce(p_order->>'status', 'confirmed'),
    coalesce(p_order->>'payment_method', 'lipa'),
    (p_order->>'total')::int,
    v_key,
    nullif(p_order->>'standing_id', '')::uuid
  ) returning id into v_order;

  insert into order_lines (order_id, item_id, qty, unit_price)
  select v_order, (l->>'item_id')::uuid, (l->>'qty')::int, (l->>'unit_price')::int
  from jsonb_array_elements(p_lines) l;

  return jsonb_build_object('ok', true, 'id', v_order);
end;
$$;
