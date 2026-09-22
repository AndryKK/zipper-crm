// One-off dated backup of the whole `inventory` table (every warehouse,
// every column) before the Підкова cleanup requested 2026-09-22 (deleting
// never-manually-entered rows from warehouse_id=2 — see
// scripts/cleanup-inventory-pidkova-unentered.js). A full-table copy, not
// just warehouse_id=2, since it costs nothing extra and gives a complete
// restore point regardless of what else might need it later.
//
// Run with: node -r dotenv/config scripts/backup-inventory-20260922.js
const { Client } = require("pg");

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set — run with: node -r dotenv/config scripts/backup-inventory-20260922.js");
    process.exit(1);
  }
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
  });
  await pg.connect();

  const exists = await pg.query(
    "SELECT 1 FROM information_schema.tables WHERE table_name = 'inventory_backup_20260922'"
  );
  if ((exists.rowCount ?? 0) > 0) {
    console.log("inventory_backup_20260922 already exists — not overwriting. Drop it manually first if you want a fresh copy.");
    await pg.end();
    return;
  }

  await pg.query("CREATE TABLE inventory_backup_20260922 AS SELECT * FROM inventory");
  const count = await pg.query("SELECT count(*) FROM inventory_backup_20260922");
  console.log("Created inventory_backup_20260922 with", count.rows[0].count, "rows.");

  await pg.end();
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
