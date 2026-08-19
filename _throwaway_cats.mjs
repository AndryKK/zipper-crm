import pg from 'pg';
import 'dotenv/config';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const r = await client.query(`select id, uri, title, lang from categories where id in (2,56,125)`);
console.log('Category ids 2,56,125:');
console.table(r.rows);

// compare with a known sibling product bs10319 (from earlier investigation) - same "Бегунок Тип 3" line
const r2 = await client.query(`select id, translation_id, pcode, title from products where pcode in ('bs10319','bs10280') and lang='ru'`);
console.log('Sibling runner products:');
console.table(r2.rows);
if (r2.rows.length) {
  const trid = r2.rows[0].translation_id;
  const r3 = await client.query(`select pc.cid, c.uri, c.title from products_categories pc join categories c on c.id = pc.cid where pc.pid=$1`, [trid]);
  console.log('Sibling categories:');
  console.table(r3.rows);
}

await client.end();
