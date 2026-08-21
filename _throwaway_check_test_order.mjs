import pg from 'pg';
import 'dotenv/config';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const r = await client.query(`select id, person, phone, login, original_client_name, addr_delivery, date from orders where login='e2etest@example.com' order by id desc limit 1`);
console.table(r.rows);
await client.end();
