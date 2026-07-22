// Full reset requested by the user: zero out quantity/initial_quantity for
// every inventory row on every warehouse, and erase all inventory_history —
// starting the stock count over from a clean slate for manual re-entry.
const { Client } = require("pg");

(async () => {
  const pg = new Client({
    connectionString: "postgresql://postgres.vtokkldabfrlcewzjliw:3654qhgRghjhkg@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
    connectionTimeoutMillis: 15000,
  });
  await pg.connect();

  await pg.query("BEGIN");
  try {
    const histDel = await pg.query("DELETE FROM inventory_history");
    console.log("Deleted inventory_history rows:", histDel.rowCount);

    const invReset = await pg.query(
      "UPDATE inventory SET quantity = 0, initial_quantity = 0, reserved = 0, updated_at = now()"
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
