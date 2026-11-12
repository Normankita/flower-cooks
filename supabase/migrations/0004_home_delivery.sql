-- Home delivery (Phase 1).
-- Orders: where the order goes. delivery_type 'home' orders have office_id NULL; delivery_note holds the landmark text.
-- Coordinates/link are optional (a customer may only describe the place) and are purged ~30 days after the order
-- when the cook creates a new cycle (privacy).
alter table orders
  add column delivery_type text not null default 'office' check (delivery_type in ('office', 'home')),
  add column delivery_lat numeric(9, 6) check (delivery_lat between -90 and 90),
  add column delivery_lng numeric(9, 6) check (delivery_lng between -180 and 180),
  add column delivery_accuracy_m int check (delivery_accuracy_m >= 0),
  add column location_url text;

-- Cycles: the cook's per-cycle controls (copied to the next cycle like lipa_namba) + kitchen position for distances.
alter table cycles
  add column home_enabled boolean not null default false,
  add column home_max_stops int check (home_max_stops is null or home_max_stops >= 0), -- null = no limit
  add column home_max_km numeric(5, 1) check (home_max_km is null or home_max_km > 0),  -- null = no limit
  add column kitchen_lat numeric(9, 6) check (kitchen_lat between -90 and 90),
  add column kitchen_lng numeric(9, 6) check (kitchen_lng between -180 and 180);

create index orders_home_idx on orders (cycle_id) where delivery_type = 'home';
