import pg from 'pg';
import 'dotenv/config';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const r = await client.query(`select id, translation_id, title from all_filters_filters where pid=3 and lang='ru' order by id`);
console.log('Group 3 ("Тип") options:');
console.table(r.rows);

const r2 = await client.query(`select id, translation_id, title from all_filters_filters where pid=7 and lang='ru' order by id`);
console.log('Group 7 ("Тип") options:');
console.table(r2.rows);

// which category(ies) is each group attached to via all_filters_items
const r3 = await client.query(`select cid, fid from all_filters_items where fid in (3,7)`);
console.log('all_filters_items rows for group 3 and 7:');
console.table(r3.rows);

await client.end();
