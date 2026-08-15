// Incremental sync: pulls rows that exist in the legacy MySQL DB
// (mozar24.mysql.tools / mozar24_zipper — still live, used by the .com.ua/.in.ua
// PHP storefronts) but are missing from the Supabase `orders`/`orders_item`/`users`
// tables. Insert-only (ON CONFLICT DO NOTHING) — never updates or deletes
// anything already in Supabase, and never writes back to MySQL.
//
// ── SAFE-TO-RUN GUARDRAILS (read before changing scope) ──────────────────
// The very first run of this script (2026-07-21, full historical backfill,
// no date scoping) fired trg_inventory_sync_items 84,725 times in a burst
// and wrongly deducted stock for years-old fulfilled orders — see
// [[feedback-bulk-insert-trigger-storm]]. A second, unrelated incident
// (2026-08-12, a que 18k-row bulk UPDATE on `orders`, not this script) took
// the whole DB down the same way. Both are the same root cause: a single
// statement/run touching many rows of a table with a webhook-firing
// trigger. This script now defends against that on every axis:
//   1. SCOPE — only pulls orders from the last ~month (see LOOKBACK_DAYS
//      below), not the full history. The one-time full backfill already
//      happened; this is a small recurring catch-up, not a reconciliation.
//      Narrowing scope is also what keeps MySQL egress and the Postgres
//      existing-id lookups cheap (no full-table scans either side).
//   2. BATCHING — inserts go through batchInsert(), 500 rows/statement,
//      BATCH_DELAY_MS apart. With LOOKBACK_DAYS scoping this rarely even
//      needs a second batch, but the pacing stays as defense-in-depth.
//   3. TRIGGER DISABLE — trg_inventory_sync_items is disabled around the
//      orders_item insert and always re-enabled in a `finally`, so a
//      backfilled historical item never fires a live stock deduction.
//   4. welcome_email_sent — every order this script inserts is a mirror of
//      something that already happened on the legacy site (the customer
//      already went through their own checkout there), not a fresh CRM
//      order — so it's stamped welcome_email_sent=true (sent_at left NULL,
//      matching how [[feedback-bulk-insert-trigger-storm]]'s backfill
//      handles "already handled, never really sent") up front. Without
//      this, every synced order — even ones from an hour ago — would
//      default to welcome_email_sent=false and the send-welcome-emails
//      cron would email the customer "we're checking your stock" days or
//      weeks after they already received the thing.
// If you ever need to widen LOOKBACK_DAYS back to a full historical
// re-sync, re-read the incident notes above first and consider whether a
// smaller batch delay increase or an explicit trigger-disable window is
// still enough, or whether it's safer to run in day-sized chunks instead.
const mysql = require("mysql2/promise");
const { Client } = require("pg");

// How far back to look in MySQL — keep this small (days/weeks, not months)
// for a routine catch-up run. Only affects `orders`; `orders_item`/`users`
// are scoped off the resulting order id/login set, not their own dates.
const LOOKBACK_DAYS = 35;

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
// runs occasionally.
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

// Chunked "does this id/login already exist in PG" check — same egress
// concern as the inserts: never SELECT the whole table, only the ids we're
// actually about to consider.
async function fetchExistingSet(pg, table, col, values) {
  const found = new Set();
  for (const batch of chunk([...new Set(values)], 1000)) {
    if (!batch.length) continue;
    const { rows } = await pg.query(`SELECT ${col} FROM ${table} WHERE ${col} = ANY($1)`, [batch]);
    for (const r of rows) found.add(r[col]);
    await sleep(50);
  }
  return found;
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

  // ---------- ORDERS (last LOOKBACK_DAYS days only) ----------
  const [myOrders] = await my.query(
    "SELECT * FROM orders WHERE date >= DATE_SUB(NOW(), INTERVAL ? DAY) ORDER BY id ASC",
    [LOOKBACK_DAYS]
  );
  const existingOrderIds = await fetchExistingSet(pg, "orders", "id", myOrders.map((o) => o.id));
  const missingOrders = myOrders.filter((o) => !existingOrderIds.has(o.id));
  console.log(`Orders (last ${LOOKBACK_DAYS}d): ${myOrders.length} in MySQL, ${existingOrderIds.size} already in PG, ${missingOrders.length} to insert`);

  const orderCols = [
    "id", "login", "person", "phone", "addr_delivery", "status", "date", "notes",
    "currency", "pay_method", "ttn", "msg", "callme", "doc_field_1", "password",
    "type", "full_name", "short_name", "addr_law", "addr_physical", "code",
    "counts", "phoned", "doc_field_3", "nationality", "issuing", "birth",
    "doc_field_2", "emergency_name", "emergency_number", "submit", "change_info",
    "currency_rate",
    // These orders already happened on the legacy site — never a fresh CRM
    // order — so mark the welcome-email cron as "nothing to do here" up
    // front. See the guardrails note at the top of this file.
    "welcome_email_sent",
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
    true, // welcome_email_sent
  ]);

  const insertedOrders = await batchInsert(pg, "orders", orderCols, orderRows);
  console.log(`Inserted ${insertedOrders} orders`);

  // Valid order ids after this insert (existing + newly inserted), for orders_item FK filtering
  const validOrderIds = new Set(existingOrderIds);
  for (const o of missingOrders) validOrderIds.add(o.id);

  // ---------- ORDERS_ITEM (only for the orders above, not the whole table) ----------
  const orderIdList = myOrders.map((o) => o.id);
  let myItems = [];
  if (orderIdList.length) {
    for (const idBatch of chunk(orderIdList, 1000)) {
      const [rows] = await my.query("SELECT * FROM orders_item WHERE oid IN (?) ORDER BY id ASC", [idBatch]);
      myItems.push(...rows);
    }
  }
  const existingItemIds = await fetchExistingSet(pg, "orders_item", "id", myItems.map((it) => it.id));
  let skippedOrphans = 0;
  const missingItems = myItems.filter((it) => {
    if (existingItemIds.has(it.id)) return false;
    if (!validOrderIds.has(it.oid)) {
      skippedOrphans++;
      return false;
    }
    return true;
  });
  console.log(`Order items: ${myItems.length} in MySQL (scoped), ${existingItemIds.size} already in PG, ${missingItems.length} to insert, ${skippedOrphans} orphans skipped (oid not in orders)`);

  const itemCols = ["id", "oid", "type", "product", "price", "quantity", "price_base"];
  const itemRows = missingItems.map((it) => [
    it.id, it.oid, it.type, it.product, it.price, it.quantity, it.price_base,
  ]);

  // trg_inventory_sync_items fires on every INSERT and calls the inventory
  // webhook — for a handful of live orders that's fine, but bulk-inserting
  // historical rows in one go would fire it that many times at once and
  // wrongly deduct stock for orders already fulfilled/reconciled. Disable
  // it for the bulk insert, always re-enable after. See the guardrails
  // note at the top of this file.
  await pg.query("ALTER TABLE public.orders_item DISABLE TRIGGER trg_inventory_sync_items");
  let insertedItems = 0;
  try {
    insertedItems = await batchInsert(pg, "orders_item", itemCols, itemRows);
  } finally {
    await pg.query("ALTER TABLE public.orders_item ENABLE TRIGGER trg_inventory_sync_items");
  }
  console.log(`Inserted ${insertedItems} order items`);

  // ---------- USERS (only logins referenced by the orders above) ----------
  const loginList = [...new Set(myOrders.map((o) => o.login).filter(Boolean))];
  let myUsers = [];
  if (loginList.length) {
    for (const loginBatch of chunk(loginList, 1000)) {
      const [rows] = await my.query("SELECT * FROM users WHERE login IN (?)", [loginBatch]);
      myUsers.push(...rows);
    }
  }
  const existingUserIds = await fetchExistingSet(pg, "users", "id", myUsers.map((u) => u.id));
  const missingUsers = myUsers.filter((u) => !existingUserIds.has(u.id));
  console.log(`Users (referenced by scoped orders): ${myUsers.length} in MySQL, ${existingUserIds.size} already in PG, ${missingUsers.length} to insert`);

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
  // Cheap/safe even when nothing was inserted this run.
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
