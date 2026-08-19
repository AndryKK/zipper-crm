import pg from 'pg';
import 'dotenv/config';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const r = await client.query(`select cid, fid from all_filters_items where fid=1 and cid in (2,56,125,35)`);
console.log('Group 1 (Цвет тесьмы) attached to runner/zipper cids?:');
console.table(r.rows);

// Full list of cids group 1 is attached to
const r2 = await client.query(`select cid from all_filters_items where fid=1 order by cid`);
console.log('All cids for group 1:', r2.rows.map(x=>x.cid));

// full list of cids group 7 attached to (already have but re-confirm 125 presence)
const r3 = await client.query(`select cid from all_filters_items where fid=7 order by cid`);
console.log('All cids for group 7 (runner Тип):', r3.rows.map(x=>x.cid));

await client.end();
