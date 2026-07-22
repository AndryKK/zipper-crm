// Resets every inventory row with quantity < 0 to 0 and logs the reset in
// inventory_history (source='manual') for the audit trail. Negative stock
// means a product was oversold/over-reserved past what's physically on hand
// — it's a deficit to fix, not "negative units", so per business rule it
// should carry zero weight everywhere (totals, fill %) rather than
// subtracting from other products' real stock.
const { Client } = require("pg");

(async () => {
  const pg = new Client({
    connectionString: "postgresql://postgres.vtokkldabfrlcewzjliw:3654qhgRghjhkg@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
    connectionTimeoutMillis: 15000,
  });
  await pg.connect();

  await pg.query("BEGIN");
  try {
    const negRows = await pg.query("SELECT id, product_id, warehouse_id, quantity FROM inventory WHERE quantity < 0");
    console.log("Negative rows to reset:", negRows.rows.length);

    for (const row of negRows.rows) {
      await pg.query("UPDATE inventory SET quantity = 0, updated_at = now() WHERE id = $1", [row.id]);
      await pg.query(
        `INSERT INTO inventory_history (product_id, warehouse_id, quantity_before, quantity_after, delta, source, changed_by, note)
         VALUES ($1, $2, $3, 0, $4, 'manual', null, $5)`,
        [
          row.product_id,
          row.warehouse_id,
          row.quantity,
          -Number(row.quantity),
          "Автоматичний скид від'ємного залишку до 0 — від'ємна кількість не відображає фізичну наявність і не має враховуватись у статистиці складу",
        ]
      );
    }

    await pg.query("COMMIT");
    console.log("COMMITTED —", negRows.rows.length, "rows reset to 0");
  } catch (e) {
    await pg.query("ROLLBACK");
    throw e;
  }

  await pg.end();
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
