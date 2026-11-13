-- Atomic order creation.
-- Before: the app read "portions taken", compared with capacity, then inserted — two orders arriving at the same
-- moment could both pass the check and oversell. Now ONE function does check + insert inside a single transaction
-- that first locks the cycle row (SELECT ... FOR UPDATE), so orders for a cycle are processed strictly one at a time.
-- The whole function is one transaction: if anything fails nothing is saved (no half-saved orders, no stray customers).
--
-- p_mode:  'open'  → capacity + home rules enforced (normal order)
--          'late'  → home rules enforced, capacity not (after cutoff; the cook approves later)
--          'admin' → no checks (the cook enters it herself)
-- Returns jsonb: {ok:true,id} | {ok:true,id,existing:true} (idempotent replay) | {ok:false,code,left?}
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

  -- Serialise all order creation for this cycle (other cycles are unaffected).
  select * into v_cycle from cycles where id = p_cycle for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'errGeneric');
  end if;

  -- Idempotent retry: the same key returns the same order. A leftover order without lines is removed.
  if v_key is not null then
    select o.id into v_order from orders o
      where o.idempotency_key = v_key and exists (select 1 from order_lines l where l.order_id = o.id);
    if v_order is not null then
      return jsonb_build_object('ok', true, 'id', v_order, 'existing', true);
    end if;
    delete from orders where idempotency_key = v_key;
  end if;

  select coalesce(sum((l->>'qty')::int), 0) into v_qty from jsonb_array_elements(p_lines) l;

  -- Home-delivery rules (the cook is never blocked in 'admin' mode).
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

  -- Capacity (portions already confirmed/delivered + this order must fit).
  if p_mode = 'open' then
    select coalesce(sum(ol.qty), 0) into v_taken
      from order_lines ol join orders o on o.id = ol.order_id
      where o.cycle_id = p_cycle and o.status in ('confirmed', 'delivered');
    if v_qty > v_cycle.capacity - v_taken then
      return jsonb_build_object('ok', false, 'code', 'errCapacity', 'left', greatest(v_cycle.capacity - v_taken, 0));
    end if;
  end if;

  -- Customer: name always refreshed; office only when given (home orders don't overwrite it);
  -- SMS consent can only be switched ON here, never off.
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
    delivery_note, notes, status, payment_method, total, idempotency_key
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
    v_key
  ) returning id into v_order;

  insert into order_lines (order_id, item_id, qty, unit_price)
  select v_order, (l->>'item_id')::uuid, (l->>'qty')::int, (l->>'unit_price')::int
  from jsonb_array_elements(p_lines) l;

  return jsonb_build_object('ok', true, 'id', v_order);
end;
$$;

-- Only the server (service role) may call it. (On plain Postgres these roles don't exist, hence the guards.)
revoke all on function create_order_atomic(uuid, text, jsonb, jsonb, jsonb) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function create_order_atomic(uuid, text, jsonb, jsonb, jsonb) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function create_order_atomic(uuid, text, jsonb, jsonb, jsonb) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function create_order_atomic(uuid, text, jsonb, jsonb, jsonb) to service_role;
  end if;
end;
$$;
