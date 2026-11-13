// Proves create_order_atomic really serialises concurrent orders, on the REAL database (needs migration 0009 applied).
// It creates TEMPORARY cycles named "ZZ-CONCURRENCY-TEST", fires many orders AT THE SAME INSTANT, checks that capacity /
// home limits / idempotency hold, then deletes everything it created (cycles cascade to orders + lines; test customers
// use phones 2557009990xx). Run:  node scripts/concurrency-live.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';

const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^(\w+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, ''); }
const base = env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, opts = {}, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${base}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) }, signal: AbortSignal.timeout(60000) });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch {}
      return { status: r.status, body: j, raw: t };
    } catch (e) { if (i === tries - 1) throw e; await sleep(1500); }
  }
}

const created = { cycles: [] };
let failures = 0;
const check = (label, ok, extra = '') => { if (!ok) failures++; console.log(ok ? 'PASS' : 'FAIL', '-', label, extra); };

try {
  const item = (await api('menu_items?select=id,price&active=eq.true&order=sort&limit=1')).body?.[0];
  const office = (await api('offices?select=id&active=eq.true&order=sort&limit=1')).body?.[0];
  if (!item || !office) throw new Error('need at least one active menu item and one active office');

  const mkCycle = async (capacity, homeMax) => {
    const r = await api('cycles', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        title: 'ZZ-CONCURRENCY-TEST (temporary)', opens_at: new Date().toISOString(),
        closes_at: new Date(Date.now() + 86400e3).toISOString(), delivery_at: new Date(Date.now() + 172800e3).toISOString(),
        capacity, status: 'open', home_enabled: true, home_max_stops: homeMax,
      }),
    });
    if (r.status >= 300) throw new Error('cannot create test cycle: ' + r.raw);
    created.cycles.push(r.body[0].id);
    return r.body[0].id;
  };

  let phoneSeq = 0;
  const call = (cycle, { qty = 1, home = false, key = null, phone } = {}) =>
    api('rpc/create_order_atomic', {
      method: 'POST',
      body: JSON.stringify({
        p_cycle: cycle, p_mode: 'open',
        p_customer: { phone: phone ?? `2557009990${String(++phoneSeq).padStart(2, '0')}`.slice(0, 12), name: 'ZZ Test', office_id: home ? null : office.id, sms_opt_in: false },
        p_order: { office_id: home ? null : office.id, delivery_type: home ? 'home' : 'office', delivery_note: 'test', status: 'confirmed', payment_method: 'cash', total: qty * item.price, idempotency_key: key },
        p_lines: [{ item_id: item.id, qty, unit_price: item.price }],
      }),
    }).then((r) => (r.status === 404 || r.status === 400 ? { fatal: r.raw } : r.body));

  // ---- Round A: capacity 5, 20 simultaneous orders of 1 portion
  const A = await mkCycle(5, null);
  const t0 = Date.now();
  const resA = await Promise.all(Array.from({ length: 20 }, () => call(A)));
  if (resA.some((r) => r?.fatal)) throw new Error('function not available (is migration 0009 applied?): ' + resA.find((r) => r?.fatal).fatal);
  const okA = resA.filter((r) => r?.ok).length;
  const fullA = resA.filter((r) => r?.code === 'errCapacity').length;
  const taken = (await api(`order_lines?select=qty,orders!inner(cycle_id,status)&orders.cycle_id=eq.${A}&orders.status=eq.confirmed`)).body?.reduce((s, x) => s + x.qty, 0);
  console.log(`   (round A: 20 simultaneous orders took ${Date.now() - t0} ms)`);
  check('A: exactly 5 of 20 simultaneous orders succeed (capacity 5)', okA === 5 && fullA === 15, `ok=${okA} full=${fullA}`);
  check('A: portions in the database = 5, never more', taken === 5, `taken=${taken}`);

  // ---- Round B: home stops limited to 3, 12 simultaneous home orders
  const B = await mkCycle(100, 3);
  const resB = await Promise.all(Array.from({ length: 12 }, () => call(B, { home: true })));
  const okB = resB.filter((r) => r?.ok).length;
  const fullB = resB.filter((r) => r?.code === 'errHomeFull').length;
  const homes = (await api(`orders?select=id&cycle_id=eq.${B}&delivery_type=eq.home`)).body?.length;
  check('B: exactly 3 of 12 simultaneous home orders succeed (max 3 stops)', okB === 3 && fullB === 9, `ok=${okB} full=${fullB}`);
  check('B: home orders in the database = 3', homes === 3, `homes=${homes}`);

  // ---- Round C: the same idempotency key fired 8 times at once → one order
  const C = await mkCycle(100, null);
  const key = crypto.randomUUID();
  const phone = '255700999099';
  const resC = await Promise.all(Array.from({ length: 8 }, () => call(C, { key, phone, qty: 2 })));
  const ids = new Set(resC.filter((r) => r?.ok).map((r) => r.id));
  const rowsC = (await api(`orders?select=id&idempotency_key=eq.${key}`)).body?.length;
  check('C: 8 simultaneous retries with one key → all succeed with the SAME order', resC.every((r) => r?.ok) && ids.size === 1, `distinct ids=${ids.size}`);
  check('C: exactly one order row for the key', rowsC === 1, `rows=${rowsC}`);
} catch (e) {
  failures++;
  console.log('ERROR -', e.message);
} finally {
  // cleanup: cycles first (cascades to orders/lines/payments), then the test customers
  for (const id of created.cycles) await api(`cycles?id=eq.${id}`, { method: 'DELETE' }).catch(() => {});
  await api('customers?phone=like.25570099*&name=eq.ZZ%20Test', { method: 'DELETE' }).catch(() => {});
  const left = await api('cycles?select=id&title=like.ZZ-CONCURRENCY*').catch(() => ({ body: [] }));
  const leftC = await api('customers?select=id&name=eq.ZZ%20Test').catch(() => ({ body: [] }));
  console.log(`cleanup: test cycles left = ${left.body?.length ?? '?'}, test customers left = ${leftC.body?.length ?? '?'}`);
}
console.log(failures ? `\n${failures} check(s) FAILED` : '\nconcurrency: all checks passed');
process.exit(failures ? 1 : 0);
