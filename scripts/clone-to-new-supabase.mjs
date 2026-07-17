// node scripts/clone-to-new-supabase.mjs
// Copies all rows from the OLD Supabase Postgres project into the NEW one,
// table by table, using raw SQL (robust against schema drift vs schema.prisma).
// Target tables must already exist (created via `prisma db push`).
//
// Usage:
//   OLD_DATABASE_URL=... NEW_DATABASE_URL=... node scripts/clone-to-new-supabase.mjs

import { PrismaClient } from "../app/generated/prisma/index.js";

const OLD_URL = process.env.OLD_DATABASE_URL;
const NEW_URL = process.env.NEW_DATABASE_URL;

if (!OLD_URL || !NEW_URL) {
  console.error("Missing OLD_DATABASE_URL / NEW_DATABASE_URL env vars");
  process.exit(1);
}

const src = new PrismaClient({ datasourceUrl: OLD_URL });
const dst = new PrismaClient({ datasourceUrl: NEW_URL });

// SQL table names in FK-safe order (parents before children).
const TABLES = [
  "adm_users", "adm_login_fails", "langs", "currency", "settings", "settings_text",
  "custom_strings", "socials", "core", "measures", "measures_real", "categories",
  "slider", "articles", "news", "services", "managers", "gallery", "users",
  "users_categories", "users_recover_password", "orders", "orders_returns", "docs",
  "warehouses", "product_groups", "all_filters",
  "products",
  "all_filters_filters", "articles_photos", "news_photos", "orders_item",
  "all_filters_items", "products_categories", "products_photos", "products_photos2",
  "products_chars", "products_colors", "products_together", "products_favourites",
  "cart", "inventory",
];

const BATCH = 500;

// Postgres truncates `text::character` (no length) to character(1) and
// `text::numeric` loses precision/scale — always reattach the length/precision
// modifiers when casting, or a bare CHAR(n)/NUMERIC(p,s) column silently corrupts data.
function castType(info) {
  const t = info.data_type;
  if ((t === "character" || t === "character varying") && info.character_maximum_length) {
    return `${t}(${info.character_maximum_length})`;
  }
  if (t === "numeric" && info.numeric_precision != null && info.numeric_scale != null) {
    return `numeric(${info.numeric_precision},${info.numeric_scale})`;
  }
  return t;
}

async function getColumnInfo(client, table) {
  const rows = await client.$queryRawUnsafe(
    `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length, numeric_precision, numeric_scale
     FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    table
  );
  return new Map(rows.map((r) => [r.column_name, r]));
}

async function getForeignKeys(client, table) {
  return client.$queryRawUnsafe(
    `SELECT kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public' AND tc.table_name = $1`,
    table
  );
}

const validIdCache = new Map();
async function getValidIds(table, column) {
  const key = `${table}.${column}`;
  if (!validIdCache.has(key)) {
    const rows = await dst.$queryRawUnsafe(`SELECT DISTINCT "${column}" AS v FROM "${table}"`);
    validIdCache.set(key, new Set(rows.map((r) => r.v)));
  }
  return validIdCache.get(key);
}

async function copyTable(table) {
  const [srcInfo, dstInfo] = await Promise.all([
    getColumnInfo(src, table),
    getColumnInfo(dst, table),
  ]);
  const srcCols = [...srcInfo.keys()];
  const columns = srcCols.filter((c) => dstInfo.has(c));
  const dropped = srcCols.filter((c) => !dstInfo.has(c));
  if (dropped.length) {
    console.log(`  ${table}: dropping columns not present on target: ${dropped.join(", ")}`);
  }

  let rows = await src.$queryRawUnsafe(`SELECT ${columns.map((c) => `"${c}"`).join(",")} FROM "${table}"`);
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows, skip`);
    return;
  }

  // Drop rows with dangling FK references up front (cheap, in-memory) instead of
  // discovering them one network round-trip at a time via failed inserts.
  const fks = (await getForeignKeys(dst, table)).filter((fk) => columns.includes(fk.column_name));
  let fkDropped = 0;
  for (const fk of fks) {
    const validSet = await getValidIds(fk.foreign_table, fk.foreign_column);
    const before = rows.length;
    rows = rows.filter((r) => r[fk.column_name] == null || validSet.has(r[fk.column_name]));
    fkDropped += before - rows.length;
  }
  if (fkDropped) {
    console.log(`  ${table}: dropped ${fkDropped} rows with dangling foreign keys`);
  }
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows left after FK filtering, skip`);
    return;
  }

  const colList = columns.map((c) => `"${c}"`).join(",");
  // For NOT NULL columns with a default, fall back to that default when the source value is null
  // (schema drift can leave nulls in the old DB for columns the new schema requires).
  const exprs = columns.map((c) => {
    const info = dstInfo.get(c);
    const cast = `::${castType(info)}`;
    if (info.is_nullable === "NO" && info.column_default) {
      return (n) => `COALESCE($${n}${cast}, ${info.column_default})`;
    }
    return (n) => `$${n}${cast}`;
  });
  const buildInsert = (batch) => {
    const values = [];
    const rowPlaceholders = batch.map((row, ri) => {
      const ph = columns.map((c, ci) => {
        values.push(row[c]);
        return exprs[ci](ri * columns.length + ci + 1);
      });
      return `(${ph.join(",")})`;
    });
    const sql = `INSERT INTO "${table}" (${colList}) VALUES ${rowPlaceholders.join(",")} ON CONFLICT DO NOTHING`;
    return { sql, values };
  };

  let skipped = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    try {
      const { sql, values } = buildInsert(chunk);
      await dst.$executeRawUnsafe(sql, ...values);
    } catch {
      // Fall back to per-row inserts so one bad row doesn't drop the whole batch.
      for (const row of chunk) {
        try {
          const { sql, values } = buildInsert([row]);
          await dst.$executeRawUnsafe(sql, ...values);
        } catch (rowErr) {
          skipped++;
          if (skipped <= 10) {
            console.log(`    skipped row id=${row.id ?? "?"}: ${rowErr.message.split("\n").pop().trim()}`);
          }
        }
      }
    }
  }
  console.log(`  ${table}: ${rows.length - skipped}/${rows.length} rows copied${skipped ? ` (${skipped} skipped)` : ""}`);

  if (columns.includes("id")) {
    await dst.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1))`
    );
  }
}

async function main() {
  console.log(`Cloning ${TABLES.length} tables...`);
  for (const table of TABLES) {
    try {
      await copyTable(table);
    } catch (err) {
      console.error(`  ${table}: FAILED - ${err.message.split("\n").pop().trim()}`);
    }
  }
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await src.$disconnect();
    await dst.$disconnect();
  });
