// Full reset requested by the user: zero out quantity/initial_quantity for
// every inventory row on every warehouse, and erase all inventory_history —
// starting the stock count over from a clean slate for manual re-entry.
// Never touches products, min_quantity, or reserved — only the live
// counted quantity and the % baseline it resets alongside (see
// app/api/inventory/route.ts's own comment on initial_quantity).
//
// Run with: node -r dotenv/config scripts/reset-all-inventory.js
// (loads DATABASE_URL from .env — never hardcode the connection string
// here; an earlier version of this file did exactly that, embedding a
// plaintext DB password directly in a committed file. Rotate that
// password if it's still valid.)
const { Client } = require("pg");

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set — run with: node -r dotenv/config scripts/reset-all-inventory.js");
    process.exit(1);
  }
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
  });
  await pg.connect();

  await pg.query("BEGIN");
  try {
    const histDel = await pg.query("DELETE FROM inventory_history");
    console.log("Deleted inventory_history rows:", histDel.rowCount);

    const invReset = await pg.query(
      "UPDATE inventory SET quantity = 0, initial_quantity = 0, updated_at = now()"
    );
    console.log("Reset inventory rows:", invReset.rowCount);

    await pg.query("COMMIT");
    console.log("COMMITTED");
  } catch (e) {
    await pg.query("ROLLBACK");
    throw e;
  }
  await pg.end();
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
