// Deletes never-manually-entered inventory rows from warehouse_id=2
// (Підкова) only — requested 2026-09-22. "Never entered" = initial_quantity
// = 0, i.e. no PUT "Змінити"/"Поставка" or POST "Додати запис" has ever
// touched it (see app/api/inventory/route.ts) — these are all leftover
// auto-inserted rows from the 2026-09-08 full reset / webhook sync, never
// a real physical count. Rows with initial_quantity > 0 (actually entered
// at least once, regardless of whether they've been touched again since)
// are explicitly kept, no matter how long ago that entry was.
//
// warehouse_id is hardcoded to 2, not read from argv/env — this must never
// accidentally run against any other warehouse.
//
// A full-table backup was already taken first: see
// scripts/backup-inventory-20260922.js -> inventory_backup_20260922.
//
// Run with: node -r dotenv/config scripts/cleanup-inventory-pidkova-unentered.js
const { Client } = require("pg");

const WAREHOUSE_ID = 2; // Підкова — see app/(admin)/inventory/page.tsx?warehouse_id=2

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set — run with: node -r dotenv/config scripts/cleanup-inventory-pidkova-unentered.js");
    process.exit(1);
  }
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
  });
  await pg.connect();

  const backupExists = await pg.query(
    "SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_backup_20260922'"
  );
  if ((backupExists.rowCount ?? 0) === 0) {
    console.error("inventory_backup_20260922 not found — run scripts/backup-inventory-20260922.js first.");
    process.exit(1);
  }

  const wh = await pg.query("SELECT title FROM warehouses WHERE id = $1", [WAREHOUSE_ID]);
  if (wh.rows[0]?.title !== "Підкова") {
    console.error(`warehouse_id ${WAREHOUSE_ID} is not "Підкова" (found: ${wh.rows[0]?.title ?? "none"}) — aborting.`);
    process.exit(1);
  }

  await pg.query("BEGIN");
  try {
    const before = await pg.query(
      "SELECT " +
        "count(*) FILTER (WHERE initial_quantity = 0) AS to_delete, " +
        "count(*) FILTER (WHERE initial_quantity > 0) AS to_keep " +
        "FROM inventory WHERE warehouse_id = $1",
      [WAREHOUSE_ID]
    );
    console.log("Before — to delete:", before.rows[0].to_delete, "| to keep (entered):", before.rows[0].to_keep);

    const del = await pg.query(
      "DELETE FROM inventory WHERE warehouse_id = $1 AND initial_quantity = 0",
      [WAREHOUSE_ID]
    );
    console.log("Deleted rows:", del.rowCount);

    const after = await pg.query(
      "SELECT count(*) AS remaining FROM inventory WHERE warehouse_id = $1",
      [WAREHOUSE_ID]
    );
    console.log("Remaining in Підкова after delete:", after.rows[0].remaining, "(should equal to_keep above)");

    const otherWarehouseCheck = await pg.query(
      "SELECT warehouse_id, count(*) FROM inventory WHERE warehouse_id != $1 GROUP BY warehouse_id",
      [WAREHOUSE_ID]
    );
    console.log("Other warehouses (should be untouched):", otherWarehouseCheck.rows);

    if (Number(after.rows[0].remaining) !== Number(before.rows[0].to_keep)) {
      throw new Error("Post-delete count mismatch — rolling back.");
    }

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
