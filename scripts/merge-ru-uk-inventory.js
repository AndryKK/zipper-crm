// One-off migration: merges per-language (ru/uk) inventory rows into a single
// row per product family (keyed by products.translation_id), since ru and uk
// listings of the same physical item were being tracked as two independent
// stock counts.
//
// IMPORTANT: this touches ONLY the `inventory` and `inventory_history` tables.
// The `products` table (and everything else) is left completely untouched —
// three other live sites read the product catalog directly from this same
// Supabase project, so nothing in `products` may change here.
//
// Previous attempt looped one warehouse-row at a time over the WAN link
// (~10k round trips) and hung for 20+ minutes without finishing — rewritten
// as a small number of set-based SQL statements instead.
const { Client } = require("pg");

(async () => {
  const pg = new Client({
    connectionString: "postgresql://postgres.vtokkldabfrlcewzjliw:3654qhgRghjhkg@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
    connectionTimeoutMillis: 15000,
    query_timeout: 120000,
  });
  await pg.connect();

  await pg.query("BEGIN");
  try {
    // pairs: keep_id is the self-matching row (translation_id = own id),
    // drop_id is its sibling in the other language. Only exact 2-row groups
    // (the products table is untouched, so the 31 groups with junk
    // duplicates still have 4 rows each and are deliberately excluded here —
    // merging those safely needs picking the right sibling among 3, not a
    // plain pair, so they're left as-is for now).
    await pg.query(`
      CREATE TEMP TABLE pairs AS
      SELECT p.id AS keep_id, sib.id AS drop_id
      FROM products p
      JOIN products sib ON sib.translation_id = p.translation_id AND sib.id != p.id
      WHERE p.translation_id = p.id
        AND p.translation_id IN (SELECT translation_id FROM products GROUP BY translation_id HAVING count(*) = 2)
    `);
    const pairCount = await pg.query("SELECT count(*) FROM pairs");
    console.log("Pairs to merge:", pairCount.rows[0].count);

    // Fold drop_id's quantity/reserved/initial_quantity into keep_id's row
    // (per warehouse), taking the greater min_quantity of the two.
    const upd = await pg.query(`
      UPDATE inventory k SET
        quantity         = k.quantity + d.quantity,
        reserved         = k.reserved + d.reserved,
        initial_quantity = k.initial_quantity + d.initial_quantity,
        min_quantity      = GREATEST(k.min_quantity, d.min_quantity),
        updated_at       = now()
      FROM pairs pr
      JOIN inventory d ON d.product_id = pr.drop_id
      WHERE k.product_id = pr.keep_id AND k.warehouse_id = d.warehouse_id
    `);
    console.log("Inventory rows updated (folded drop into keep):", upd.rowCount);

    // Drop-side rows that DID get folded above (i.e. a matching keep-side
    // row existed for that warehouse) are now redundant — delete them.
    const del = await pg.query(`
      DELETE FROM inventory d USING pairs pr
      WHERE d.product_id = pr.drop_id
        AND EXISTS (
          SELECT 1 FROM inventory k
          WHERE k.product_id = pr.keep_id AND k.warehouse_id = d.warehouse_id
        )
    `);
    console.log("Redundant inventory rows deleted:", del.rowCount);

    // Drop-side rows with NO matching keep-side row for that warehouse
    // (shouldn't normally happen — every product has a row per warehouse —
    // but handle it defensively) — just retarget them to keep_id instead of
    // losing the data.
    const retarget = await pg.query(`
      UPDATE inventory d SET product_id = pr.keep_id
      FROM pairs pr
      WHERE d.product_id = pr.drop_id
    `);
    console.log("Orphan drop-side rows retargeted to keep_id:", retarget.rowCount);

    // Migrate inventory_history so the merged row's full audit trail is visible.
    const hist = await pg.query(`
      UPDATE inventory_history h SET product_id = pr.keep_id
      FROM pairs pr
      WHERE h.product_id = pr.drop_id
    `);
    console.log("inventory_history rows migrated:", hist.rowCount);

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
