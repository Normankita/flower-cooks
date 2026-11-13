// Functional tests of create_order_atomic() on an in-memory Postgres (PGlite), after applying every migration.
// Sequential logic only: real parallel behaviour (the row lock) is checked by scripts/concurrency-live.mjs.
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';

const dir = './supabase/migrations';
const db = new PGlite({ extensions: { pgcrypto } });
for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}_.+\.sql$/.test(x)).sort()) await db.exec(fs.readFileSync(`${dir}/${f}`, 'utf8'));

const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const count = async (sql, params = []) => Number((await one(sql, params)).n);

// seed: an office, a menu item, a cycle with capacity 5, home delivery on with max 2 stops
const office = (await one(`select id from offices order by sort limit 1`)).id;
const item = (await one(`select id from menu_items order by sort limit 1`)).id;
const cyc = (await one(
  `insert into cycles (title, closes_at, delivery_at, capacity, home_enabled, home_max_stops)
   values ('T', now() + interval '1 day', now() + interval '2 days', 5, true, 2) returning id`,
)).id;

let n = 0;
const order = async (qty, { mode = 'open', phone, name = 'Asha', home = false, key = null, status = 'confirmed', office_id = office, optIn = false } = {}) => {
  n++;
  const r = await one(
    `select create_order_atomic($1::uuid, $2, $3::jsonb, $4::jsonb, $5::jsonb) as r`,
    [
      cyc,
      mode,
      JSON.stringify({ phone: phone ?? `2557000000${String(n).padStart(2, '0')}`, name, office_id: home ? null : office_id, sms_opt_in: optIn }),
      JSON.stringify({ office_id: home ? null : office_id, delivery_type: home ? 'home' : 'office', delivery_note: 'x', status, payment_method: 'cash', total: qty * 8000, idempotency_key: key }),
      JSON.stringify([{ item_id: item, qty, unit_price: 8000 }]),
    ],
  );
  return r.r;
};
const portions = () => count(`select coalesce(sum(ol.qty),0) n from order_lines ol join orders o on o.id=ol.order_id where o.cycle_id=$1 and o.status in ('confirmed','delivered')`, [cyc]);

// ---- capacity boundary
assert.deepEqual(await order(3), { ok: true, id: (await one(`select id from orders order by created_at desc limit 1`)).id });
let r = await order(3);
assert.deepEqual([r.ok, r.code, r.left], [false, 'errCapacity', 2], 'only 2 left, 3 requested');
assert.equal(await portions(), 3, 'a refused order saves nothing');
r = await order(2);
assert.equal(r.ok, true, 'exactly filling the cycle is allowed');
r = await order(1);
assert.deepEqual([r.ok, r.code, r.left], [false, 'errCapacity', 0], 'full');
assert.equal(await portions(), 5);

// ---- late and admin orders are not blocked by capacity; late ones don't consume it
r = await order(4, { mode: 'late', status: 'late_request' });
assert.equal(r.ok, true, 'late requests ignore capacity (the cook approves them)');
assert.equal(await portions(), 5, 'a late_request is not counted as taken');
r = await order(4, { mode: 'admin' });
assert.equal(r.ok, true, 'the cook can always enter an order herself');
assert.equal(await portions(), 9);
// free capacity again by cancelling: cancelled orders do not count
await db.exec(`update orders set status='cancelled' where id in (select o.id from orders o where o.cycle_id='${cyc}' and o.status='confirmed' order by created_at limit 2)`);
assert.equal(await portions(), 4, 'cancelled orders free their portions');
r = await order(1);
assert.equal(r.ok, true);
r = await order(1);
assert.equal(r.code, 'errCapacity', 'full again');
await db.exec(`update orders set status='cancelled' where cycle_id='${cyc}'`);

// ---- idempotency: same key → same order, no double counting
const key = crypto.randomUUID();
const a = await order(2, { key, phone: '255700000900' });
const b = await order(2, { key, phone: '255700000900' });
assert.equal(a.ok && b.ok, true);
assert.equal(a.id, b.id, 'replay returns the original order');
assert.equal(b.existing, true);
assert.equal(await count(`select count(*) n from orders where idempotency_key=$1`, [key]), 1, 'exactly one order for the key');
assert.equal(await portions(), 2, 'the replay did not take capacity twice');
// a half-saved leftover (order without lines) with the same key is cleaned up and the order created properly
const key2 = crypto.randomUUID();
const cust = (await one(`select id from customers limit 1`)).id;
await db.query(`insert into orders (cycle_id, customer_id, total, idempotency_key) values ($1,$2,0,$3)`, [cyc, cust, key2]);
const c2 = await order(1, { key: key2, phone: '255700000901' });
assert.equal(c2.ok, true);
assert.equal(await count(`select count(*) n from orders where idempotency_key=$1`, [key2]), 1, 'leftover removed, one real order');
assert.equal(await count(`select count(*) n from order_lines where order_id=$1`, [c2.id]), 1);
await db.exec(`update orders set status='cancelled' where cycle_id='${cyc}'`);

// ---- home-delivery limits
assert.equal((await order(1, { home: true })).ok, true);
assert.equal((await order(1, { home: true })).ok, true);
r = await order(1, { home: true });
assert.equal(r.code, 'errHomeFull', 'third home stop refused (max 2)');
assert.equal((await order(1, { home: true, mode: 'admin' })).ok, true, 'cook can exceed the home limit');
assert.equal((await order(1)).ok, true, 'office orders are unaffected by the home limit');
await db.exec(`update cycles set home_enabled=false where id='${cyc}'`);
assert.equal((await order(1, { home: true })).code, 'errHomeOff');
assert.equal((await order(1, { home: true, mode: 'late', status: 'late_request' })).code, 'errHomeOff', 'late home requests also need home enabled');
await db.exec(`update cycles set home_enabled=true where id='${cyc}'`);
await db.exec(`update orders set status='cancelled' where cycle_id='${cyc}'`);

// ---- customer semantics
await order(1, { phone: '255700000777', name: 'Old Name' });
const office2 = (await one(`select id from offices order by sort offset 1 limit 1`)).id;
await order(1, { phone: '255700000777', name: 'New Name', office_id: office2 });
let c = await one(`select name, office_id, sms_opt_in from customers where phone='255700000777'`);
assert.deepEqual([c.name, c.office_id, c.sms_opt_in], ['New Name', office2, false], 'name refreshed, office updated');
await order(1, { phone: '255700000777', home: true, name: 'New Name' });
c = await one(`select office_id from customers where phone='255700000777'`);
assert.equal(c.office_id, office2, 'a home order does not wipe the saved office');
await order(1, { phone: '255700000777', optIn: true });
c = await one(`select sms_opt_in, sms_opt_in_at from customers where phone='255700000777'`);
assert.equal(c.sms_opt_in, true);
assert.ok(c.sms_opt_in_at, 'consent time recorded');
await order(1, { phone: '255700000777', optIn: false });
c = await one(`select sms_opt_in from customers where phone='255700000777'`);
assert.equal(c.sms_opt_in, true, 'an unticked box never switches consent off');
await db.exec(`update orders set status='cancelled' where cycle_id='${cyc}'`);

// ---- all-or-nothing: a bad item makes the whole call fail and saves NOTHING (no customer, no order)
const customersBefore = await count(`select count(*) n from customers`);
const ordersBefore = await count(`select count(*) n from orders`);
await assert.rejects(
  db.query(`select create_order_atomic($1::uuid,'open',$2::jsonb,$3::jsonb,$4::jsonb)`, [
    cyc,
    JSON.stringify({ phone: '255700000999', name: 'Ghost' }),
    JSON.stringify({ delivery_type: 'office', status: 'confirmed', payment_method: 'cash', total: 8000 }),
    JSON.stringify([{ item_id: crypto.randomUUID(), qty: 1, unit_price: 8000 }]), // not a real menu item
  ]),
  /foreign key|violates/i,
);
assert.equal(await count(`select count(*) n from customers`), customersBefore, 'rolled back: no stray customer');
assert.equal(await count(`select count(*) n from orders`), ordersBefore, 'rolled back: no stray order');

// ---- guard rails
assert.deepEqual((await one(`select create_order_atomic($1::uuid,'open','{}'::jsonb,'{}'::jsonb,'[]'::jsonb) as r`, [cyc])).r, { ok: false, code: 'errItems' });
assert.equal((await one(`select create_order_atomic($1::uuid,'open','{}'::jsonb,'{}'::jsonb,'[{}]'::jsonb) as r`, [crypto.randomUUID()]).catch(() => ({ r: { ok: false } }))).r.ok, false, 'unknown cycle');
await assert.rejects(db.query(`select create_order_atomic($1::uuid,'hack','{}'::jsonb,'{}'::jsonb,'[]'::jsonb)`, [cyc]), /bad mode/);

// ---- standing orders (migration 0010)
const sc = (await one(`select id from customers where phone='255700000777'`)).id;
const so = (await one(
  `insert into standing_orders (customer_id, office_id, payment_method, lines) values ($1,$2,'cash',$3::jsonb) returning id, token, active`,
  [sc, office, JSON.stringify([{ item_id: item, qty: 2 }])],
));
assert.equal(so.active, true);
assert.match(String(so.token), /^[0-9a-f-]{36}$/);
// one ACTIVE standing order per customer; a paused one doesn't count
await assert.rejects(db.query(`insert into standing_orders (customer_id, payment_method, lines) values ($1,'cash',$2::jsonb)`, [sc, JSON.stringify([{ item_id: item, qty: 1 }])]), /unique|duplicate/i);
await db.exec(`update standing_orders set active=false where id='${so.id}'`);
const so2 = await one(`insert into standing_orders (customer_id, payment_method, lines) values ($1,'cash',$2::jsonb) returning id`, [sc, JSON.stringify([{ item_id: item, qty: 1 }])]);
await assert.rejects(db.exec(`update standing_orders set active=true where id='${so.id}'`), /unique|duplicate/i, 'cannot resume while another is active');
await db.exec(`delete from standing_orders where id='${so2.id}'`);
await db.exec(`update standing_orders set active=true where id='${so.id}'`);
// lines must be a non-empty array
await assert.rejects(db.query(`insert into standing_orders (customer_id, payment_method, lines) values ($1,'cash','[]'::jsonb)`, [crypto.randomUUID()]), /violates|check|foreign/i);
// the function stores standing_id; replays with the deterministic key return the same order
const sk = crypto.randomUUID();
const viaFn = async () => (await one(
  `select create_order_atomic($1::uuid,'open',$2::jsonb,$3::jsonb,$4::jsonb) as r`,
  [cyc, JSON.stringify({ phone: '255700000777', name: 'X', office_id: office }), JSON.stringify({ office_id: office, delivery_type: 'office', status: 'confirmed', payment_method: 'cash', total: 16000, idempotency_key: sk, standing_id: so.id }), JSON.stringify([{ item_id: item, qty: 2, unit_price: 8000 }])],
)).r;
const s1 = await viaFn();
const s2 = await viaFn();
assert.equal(s1.ok && s2.ok, true);
assert.equal(s1.id, s2.id, 'same key → same order (materialising twice cannot duplicate)');
assert.equal((await one(`select standing_id from orders where id=$1`, [s1.id])).standing_id, so.id);
// skipping: one row per (standing, cycle)
await db.query(`insert into standing_skips (standing_id, cycle_id) values ($1,$2)`, [so.id, cyc]);
await assert.rejects(db.query(`insert into standing_skips (standing_id, cycle_id) values ($1,$2)`, [so.id, cyc]), /unique|duplicate|primary/i);
// deleting a standing order keeps its past orders (standing_id set null) and removes its skips
await db.exec(`delete from standing_orders where id='${so.id}'`);
assert.equal((await one(`select standing_id from orders where id=$1`, [s1.id])).standing_id, null, 'past orders survive');
assert.equal(await count(`select count(*) n from standing_skips`), 0, 'skips cascade');
// reviews: hidden defaults to false
const ro = (await one(`select id from orders limit 1`)).id;
const rv = await one(`insert into reviews (order_id, rating, comment) values ($1, 5, 'ok') returning hidden`, [ro]);
assert.equal(rv.hidden, false);

console.log('create_order_atomic: all checks passed');
