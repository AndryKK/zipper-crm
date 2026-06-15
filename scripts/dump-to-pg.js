// Dumps MySQL data to PostgreSQL-compatible INSERT statements for Supabase import.
// Run: node scripts/dump-to-pg.js
// Requires: DATABASE_URL in .env (mysql://...)

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// Load .env manually (no dotenv dependency assumed)
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
if (!match) { console.error('DATABASE_URL not found in .env'); process.exit(1); }

const rawUrl = match[1];
const parsed = new URL(rawUrl);

const config = {
  host: parsed.hostname,
  port: parseInt(parsed.port || '3306'),
  user: parsed.username,
  password: parsed.password, // URL already decoded by URL constructor
  database: parsed.pathname.slice(1),
  timezone: '+00:00',
};

function pgLiteral(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'number') return String(val);
  if (val instanceof Date) {
    return `'${val.toISOString().replace('T', ' ').slice(0, 23)}'`;
  }
  // Escape string: single-quote → two single-quotes, backslash → E-escape
  const s = String(val);
  if (s.includes('\\')) {
    return `E'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  return `'${s.replace(/'/g, "''")}'`;
}

// Tables in FK-safe order (parents before children)
const TABLE_ORDER = [
  'langs', 'currency', 'adm_users', 'adm_login_fails',
  'settings', 'settings_text', 'custom_strings', 'socials', 'core',
  'measures', 'measures_real',
  'users', 'users_categories', 'users_recover_password',
  'all_filters', 'all_filters_filters',
  'slider', 'gallery', 'docs',
  'categories', 'products', 'managers', 'services', 'articles', 'news',
  'products_categories', 'products_photos', 'products_photos2',
  'products_chars', 'products_colors', 'products_together',
  'products_favourites', 'all_filters_items',
  'cart', 'orders', 'orders_item', 'orders_returns',
  'articles_photos', 'news_photos',
];

async function main() {
  console.log(`Connecting to ${config.host}:${config.port}/${config.database} ...`);
  const conn = await mysql.createConnection(config);

  // Get actual table list from DB (some may not exist yet)
  const [tableRows] = await conn.query('SHOW TABLES');
  const existingTables = new Set(tableRows.map(r => Object.values(r)[0]));

  // Order: known tables first, then any extras
  const ordered = TABLE_ORDER.filter(t => existingTables.has(t));
  for (const t of existingTables) {
    if (!TABLE_ORDER.includes(t)) ordered.push(t);
  }

  const lines = [];
  lines.push('-- PostgreSQL data dump from MySQL');
  lines.push(`-- Source: ${config.host}/${config.database}`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('-- Disable FK checks during import');
  lines.push('SET session_replication_role = replica;');
  lines.push('');

  let totalRows = 0;

  for (const table of ordered) {
    const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
    lines.push(`-- ${table}: ${rows.length} rows`);

    if (rows.length === 0) {
      lines.push('');
      continue;
    }

    const cols = Object.keys(rows[0]);
    const quotedCols = cols.map(c => `"${c}"`).join(', ');

    for (const row of rows) {
      const vals = cols.map(c => pgLiteral(row[c])).join(', ');
      lines.push(`INSERT INTO "${table}" (${quotedCols}) VALUES (${vals});`);
    }

    // Reset sequence for id column so new rows won't conflict
    if (cols.includes('id')) {
      const maxId = Math.max(...rows.map(r => r.id || 0));
      lines.push(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), ${maxId}, true);`);
    }

    lines.push('');
    totalRows += rows.length;
    console.log(`  ✓ ${table}: ${rows.length} rows`);
  }

  lines.push('-- Re-enable FK checks');
  lines.push('SET session_replication_role = DEFAULT;');

  const outFile = path.join(__dirname, '..', 'backup-mysql-data.sql');
  fs.writeFileSync(outFile, lines.join('\n'), 'utf8');

  await conn.end();

  console.log('');
  console.log(`Done. Total rows: ${totalRows}`);
  console.log(`Saved to: ${outFile}`);
  console.log('');
  console.log('Next steps for Supabase:');
  console.log('  1. Change prisma/schema.prisma: provider = "postgresql"');
  console.log('  2. Set DATABASE_URL to your Supabase postgres:// URL');
  console.log('  3. npx prisma migrate dev --name init   (creates tables)');
  console.log('  4. Import backup-mysql-data.sql via Supabase SQL Editor');
}

main().catch(err => { console.error(err); process.exit(1); });
