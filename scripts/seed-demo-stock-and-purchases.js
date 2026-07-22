// Demo data for testing: random-fills quantity for 10 chosen products across
// both warehouses via the real PUT /api/inventory endpoint (mode="set", so
// initial_quantity gets recorded exactly like a real first manual entry —
// see lib/inventory.ts / app/api/inventory/route.ts), then creates 5 real
// orders (with items) for 5 of those products so the order webhook trigger
// deducts stock normally and inventory_history gets real order_created
// entries to look at.
const { Client } = require("pg");
const { encode } = require("next-auth/jwt");

const PRODUCT_IDS = [8292, 575, 9583, 3135, 6670, 411, 9395, 459, 1435, 2209];
const PURCHASE_PRODUCT_IDS = [8292, 575, 9583, 3135, 6670]; // first 5 of the above
const API_BASE = "http://localhost:4000";

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function mintSession() {
  return encode({
    token: { name: "test-admin", email: "test@local", sub: "1" },
    secret: "zipper-crm-secret-key-change-in-production-32chars",
    salt: "authjs.session-token",
  });
}

(async () => {
  const pg = new Client({
    connectionString: "postgresql://postgres.vtokkldabfrlcewzjliw:3654qhgRghjhkg@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
    connectionTimeoutMillis: 15000,
  });
  await pg.connect();

  const token = await mintSession();
  const cookie = `authjs.session-token=${token}`;

  // ── Step 1: random-fill quantity for all 10 products in both warehouses ──
  const invRows = await pg.query(
    "SELECT id, product_id, warehouse_id FROM inventory WHERE product_id = ANY($1) ORDER BY product_id, warehouse_id",
    [PRODUCT_IDS]
  );
  console.log(`Found ${invRows.rows.length} inventory rows for ${PRODUCT_IDS.length} products x 2 warehouses`);

  for (const row of invRows.rows) {
    const qty = randInt(20, 400);
    const res = await fetch(`${API_BASE}/api/inventory`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ id: row.id, mode: "set", quantity: qty, note: "Демо-заповнення (перше ручне введення)" }),
    });
    if (!res.ok) {
      console.error("PUT failed for row", row.id, await res.text());
      continue;
    }
    console.log(`product ${row.product_id} / warehouse ${row.warehouse_id} -> quantity=${qty}`);
  }

  // ── Step 2: create 5 real orders (1 item each) for 5 of the 10 products ──
  const maxId = (await pg.query("SELECT COALESCE(MAX(id),0) AS m FROM orders")).rows[0].m;
  const maxItemId = (await pg.query("SELECT COALESCE(MAX(id),0) AS m FROM orders_item")).rows[0].m;
  let nextOrderId = Number(maxId) + 1;
  let nextItemId = Number(maxItemId) + 1;

  for (const productId of PURCHASE_PRODUCT_IDS) {
    const invBefore = await pg.query(
      "SELECT quantity FROM inventory WHERE product_id = $1 AND warehouse_id = 1",
      [productId]
    );
    const available = Number(invBefore.rows[0]?.quantity ?? 0);
    const purchaseQty = Math.max(1, Math.min(available - 1, randInt(1, 10))); // stay safely below available

    const orderId = nextOrderId++;
    const itemId = nextItemId++;

    await pg.query(
      `INSERT INTO orders (id, login, person, phone, addr_delivery, status, date, currency, currency_rate, type, ttn, phoned, callme)
       VALUES ($1, 'demo@test.local', 'Демо Покупець', '0501234567', 'Київ — Відділення №1', 'Завершено', now(), 'грн', 1, 'uk', '', '0', 0)`,
      [orderId]
    );
    await pg.query(
      `INSERT INTO orders_item (id, oid, type, product, price, quantity, price_base)
       VALUES ($1, $2, 'prod', $3, 10, $4, 10)`,
      [itemId, orderId, productId, purchaseQty]
    );
    console.log(`Order #${orderId}: product ${productId} x${purchaseQty} (available was ${available})`);
  }

  await pg.query(
    "SELECT setval('orders_id_seq', (SELECT MAX(id) FROM orders)), setval('orders_item_id_seq', (SELECT MAX(id) FROM orders_item))"
  );

  await pg.end();
  console.log("DONE — waiting a few seconds for the webhook (pg_net, async) to process the 5 order_item inserts...");
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
