// One-off backfill: pulls rows that exist in the legacy MySQL DB
// (mozar24.mysql.tools / mozar24_zipper — still live, used by the .com.ua/.in.ua
// PHP storefronts) but are missing from the Supabase `orders`/`orders_item`/`users`
// tables. Insert-only (ON CONFLICT DO NOTHING) — never updates or deletes
// anything already in Supabase, and never writes back to MySQL.
const mysql = require("mysql2/promise");
const { Client } = require("pg");

const STATUS_MAP = {
  "Завершен": "Завершено",
  "Получен": "Отримано",
  "В работе": "В роботі",
  "Обновление": "Завершено",
};

function toIntOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return /^-?\d+$/.test(s) ? parseInt(s, 10) : null;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 300ms pause between batches — keeps this from ever hammering the pooler/DB
// with back-to-back large statements. Cheap insurance since this script only
// runs occasionally (a few hundred batches costs a couple extra minutes, not
// worth the risk of saturating connections again).
const BATCH_DELAY_MS = 300;

async function batchInsert(pg, table, columns, rows, conflictCol = "id") {
  if (rows.length === 0) return 0;
  let inserted = 0;
  const conflictClause = conflictCol ? `ON CONFLICT (${conflictCol}) DO NOTHING` : "ON CONFLICT DO NOTHING";
  for (const batch of chunk(rows, 500)) {
    const values = [];
    const placeholders = batch.map((row, i) => {
      const base = i * columns.length;
      values.push(...row);
      return `(${columns.map((_, j) => `$${base + j + 1}`).join(",")})`;
    });
    const sql = `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders.join(",")} ${conflictClause}`;
    const res = await pg.query(sql, values);
    inserted += res.rowCount;
    await sleep(BATCH_DELAY_MS);
  }
  return inserted;
}

(async () => {
  const my = await mysql.createConnection({
    host: "mozar24.mysql.tools",
    database: "mozar24_zipper",
    user: "mozar24_zipper",
    password: "IUfdy#%&@tewWu2342",
    connectTimeout: 15000,
    charset: "utf8mb4",
  });
  const pg = new Client({
    connectionString:
      "postgresql://postgres.vtokkldabfrlcewzjliw:3654qhgRghjhkg@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
  });
  await pg.connect();

  // ---------- ORDERS ----------
  const existingOrderIds = new Set(
    (await pg.query("SELECT id FROM orders")).rows.map((r) => r.id)
  );
  const [myOrders] = await my.query("SELECT * FROM orders ORDER BY id ASC");
  const missingOrders = myOrders.filter((o) => !existingOrderIds.has(o.id));
  console.log(`Orders: ${myOrders.length} in MySQL, ${existingOrderIds.size} already in PG, ${missingOrders.length} to insert`);

  const orderCols = [
    "id", "login", "person", "phone", "addr_delivery", "status", "date", "notes",
    "currency", "pay_method", "ttn", "msg", "callme", "doc_field_1", "password",
    "type", "full_name", "short_name", "addr_law", "addr_physical", "code",
    "counts", "phoned", "doc_field_3", "nationality", "issuing", "birth",
    "doc_field_2", "emergency_name", "emergency_number", "submit", "change_info",
    "currency_rate",
  ];

  const orderRows = missingOrders.map((o) => [
    o.id,
    o.login ?? "",
    o.person,
    o.phone,
    o.addrDelivery,
    STATUS_MAP[o.status] ?? o.status,
    o.date,
    o.notes,
    o.currency,
    o.pay_method,
    o.ttn,
    o.msg,
    o.callme,
    o["1"],
    o.password ?? "",
    o.type,
    o.fullName,
    o.shortName,
    o.addrLaw,
    o.addrPhysical,
    o.code,
    o.counts,
    toIntOrNull(o.phoned),
    o["3"],
    o.nationality,
    o.issuing,
    o.birth,
    o["2"],
    o["emergency-name"],
    o["emergency-number"],
    o.submit,
    o.change_info,
    o.currency_rate,
  ]);

  const insertedOrders = await batchInsert(pg, "orders", orderCols, orderRows);
  console.log(`Inserted ${insertedOrders} orders`);

  // Valid order ids after this insert (existing + newly inserted), for orders_item FK filtering
  const validOrderIds = new Set(existingOrderIds);
  for (const o of missingOrders) validOrderIds.add(o.id);

  // ---------- ORDERS_ITEM ----------
  const existingItemIds = new Set(
    (await pg.query("SELECT id FROM orders_item")).rows.map((r) => r.id)
  );
  const [myItems] = await my.query("SELECT * FROM orders_item ORDER BY id ASC");
  let skippedOrphans = 0;
  const missingItems = myItems.filter((it) => {
    if (existingItemIds.has(it.id)) return false;
    if (!validOrderIds.has(it.oid)) {
      skippedOrphans++;
      return false;
    }
    return true;
  });
  console.log(`Order items: ${myItems.length} in MySQL, ${existingItemIds.size} already in PG, ${missingItems.length} to insert, ${skippedOrphans} orphans skipped (oid not in orders)`);

  const itemCols = ["id", "oid", "type", "product", "price", "quantity", "price_base"];
  const itemRows = missingItems.map((it) => [
    it.id, it.oid, it.type, it.product, it.price, it.quantity, it.price_base,
  ]);

  // trg_inventory_sync_items fires on every INSERT and calls the inventory
  // webhook — for a handful of live orders that's fine, but bulk-inserting
  // thousands of *historical* rows would fire it thousands of times and wrongly
  // deduct stock for orders that were fulfilled and reconciled long ago (this
  // is exactly what happened the first time this script ran without the guard
  // below — see inventory_history source='manual' reversal entries from
  // 2026-07-21). Disable it for the bulk insert, always re-enable after.
  await pg.query("ALTER TABLE public.orders_item DISABLE TRIGGER trg_inventory_sync_items");
  let insertedItems = 0;
  try {
    insertedItems = await batchInsert(pg, "orders_item", itemCols, itemRows);
  } finally {
    await pg.query("ALTER TABLE public.orders_item ENABLE TRIGGER trg_inventory_sync_items");
  }
  console.log(`Inserted ${insertedItems} order items`);

  // ---------- USERS ----------
  const existingUserIds = new Set(
    (await pg.query("SELECT id FROM users")).rows.map((r) => r.id)
  );
  const [myUsers] = await my.query("SELECT * FROM users ORDER BY id ASC");
  const missingUsers = myUsers.filter((u) => !existingUserIds.has(u.id));
  console.log(`Users: ${myUsers.length} in MySQL, ${existingUserIds.size} already in PG, ${missingUsers.length} to insert`);

  const userCols = [
    "id", "login", "password", "oldpassword", "type", "full_name", "short_name",
    "addr_law", "addr_physical", "code", "person", "phone", "addr_delivery",
    "doc_field_1", "doc_field_3", "nationality", "issuing", "birth", "doc_field_2",
    "emergency_name", "emergency_number", "notes", "submit", "change_info", "rank",
    "submit_new", "submit_new2", "submit_new_user",
  ];
  const userRows = missingUsers.map((u) => [
    u.id, u.login ?? "", u.password ?? "", u.oldpassword, u.type, u.fullName,
    u.shortName, u.addrLaw, u.addrPhysical, u.code, u.person, u.phone,
    u.addrDelivery, u["1"], u["3"], u.nationality, u.issuing, u.birth, u["2"],
    u["emergency-name"], u["emergency-number"], u.notes, u.submit, u.change_info,
    u.rank, u.submit_new, u.submit_new2, u.submit_new_user,
  ]);
  const insertedUsers = await batchInsert(pg, "users", userCols, userRows, null);
  console.log(`Inserted ${insertedUsers} users`);

  // Explicit-id inserts don't advance the SERIAL sequences — fix them up so
  // the next native INSERT (checkout, CRM) doesn't collide with a backfilled id.
  await pg.query("SELECT setval('orders_id_seq', (SELECT MAX(id) FROM orders))");
  await pg.query("SELECT setval('orders_item_id_seq', (SELECT MAX(id) FROM orders_item))");
  await pg.query("SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))");

  await my.end();
  await pg.end();
  console.log("DONE");
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
