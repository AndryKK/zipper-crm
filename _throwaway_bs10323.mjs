import pg from 'pg';
import 'dotenv/config';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const r = await client.query(`select id, translation_id, pcode, title, active, lang from products where pcode='bs10323'`);
console.log('Product bs10323:');
console.table(r.rows);

if (r.rows.length) {
  const trid = r.rows.find(x=>x.lang==='ru')?.translation_id || r.rows[0].translation_id;

  // check color group
  const r2 = await client.query(`select * from products_colors where pid = $1 or pid_with = $1`, [trid]);
  console.log('products_colors links:');
  console.table(r2.rows);

  // check category assignment
  const r3 = await client.query(`select * from products_categories where pid = $1`, [trid]);
  console.log('products_categories (pid=translation_id):');
  console.table(r3.rows);

  // check filter tags attached to this product
  const r4 = await client.query(`select afi.fid, aff.title as option_title, aff.pid as group_translation_id, af.title as group_title
    from all_filters_filters_items afi
    join all_filters_filters aff on aff.translation_id = afi.fid and aff.lang='ru'
    join all_filters af on af.translation_id = aff.pid and af.lang='ru'
    where afi.pid = $1`, [trid]);
  console.log('Filter tags attached to this product (ru):');
  console.table(r4.rows);
}

await client.end();
