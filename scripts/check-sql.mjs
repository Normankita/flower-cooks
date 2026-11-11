// Validates every migration in supabase/migrations by applying them in order to an in-memory Postgres (PGlite).
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';

const dir = './supabase/migrations';
const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
const db = new PGlite({ extensions: { pgcrypto } });

for (const f of files) {
  try {
    await db.exec(fs.readFileSync(`${dir}/${f}`, 'utf8'));
    console.log('applied', f);
  } catch (e) {
    console.error('FAILED', f, '-', e.message);
    process.exit(1);
  }
}

const r = await db.query("select (select count(*) from offices) o, (select count(*) from menu_items) m");
console.log(r.rows);
try {
  await db.exec("insert into orders(cycle_id,customer_id) values (gen_random_uuid(),gen_random_uuid())");
  console.error('FK NOT enforced');
  process.exit(1);
} catch (e) {
  console.log('FK enforced OK:', e.message.slice(0, 60));
}
