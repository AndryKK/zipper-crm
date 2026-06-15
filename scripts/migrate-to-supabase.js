// Converts MySQL dump to PostgreSQL SQL files for Supabase import.
// Run: node scripts/migrate-to-supabase.js
// Then import the generated files in Supabase SQL Editor (in order).

const fs = require('fs');
const path = require('path');

const DUMP_FILE = path.join(__dirname, 'dump-extracted', 'mysql_mozar24_zipper.2026-06-01_1706.sql');
const OUT_DIR = path.join(__dirname, '..', 'supabase-import');

// Columns to import per PG table (names must match MySQL CREATE TABLE column names)
const COLUMN_MAPS = {
  'adm_login_fails':        ['id', 'ip', 'data', 'times'],
  'adm_users':              ['id', 'status', 'login', 'pass'],
  'langs':                  ['id', 'code', 'flag', 'title', 'active', 'visibility', 'priority'],
  'currency':               ['id', 'title', 'rate', 'uri', 'enabled'],
  'settings':               ['id', 'value', 'text', 'lang'],
  'settings_text':          ['id', 'value', 'text', 'lang'],
  'custom_strings':         ['id', 'value', 'text', 'lang'],
  'socials':                ['id', 'icon', 'title', 'text', 'priority', 'enabled'],
  'core':                   ['id', 'uri', 'lang', 'heading', 'text', 'text2', 'seoTitle', 'seoKey', 'seoDescr'],
  'measures':               ['id', 'translationId', 'lang', 'title', 'short_title', 'priority'],
  'measures_real':          ['id', 'translationId', 'lang', 'title', 'short_title', 'priority'],
  'categories':             ['id', 'translationId', 'lang', 'pid', 'title', 'uri', 'img', 'img2',
                             'discount', 'ndiscount', 'visibility', 'priority', 'descr', 'text',
                             'seoTitle', 'seoKey', 'seoDescr'],
  'products':               ['id', 'translationId', 'lang', 'pid', 'filterId', 'pcode', 'uri',
                             'img', 'img2', 'title', 'main_title', 'heading', 'package', 'price',
                             'price_sale', 'price2n', 'price2', 'price3n', 'price3', 'labelAction',
                             'text', 'priority', 'popular', 'measure', 'minquantity', 'descr',
                             'seoTitle', 'seoKey', 'active'],
  'products_categories':    ['id', 'pid', 'cid'],
  'products_photos':        ['id', 'pid', 'img', 'priority'],
  'products_photos2':       ['id', 'pid', 'img', 'priority'],
  'products_chars':         ['id', 'lang', 'pid', 'chid', 'title'],
  'products_colors':        ['id', 'pid', 'pid_with'],
  'products_together':      ['id', 'pid', 'pid_with'],
  // all_filters_items comes from all_filters_filters_items (see REMAP_SOURCES below)
  'all_filters':            ['id', 'translationId', 'pid', 'lang', 'uri', 'img', 'title', 'descr', 'priority'],
  'all_filters_filters':    ['id', 'translationId', 'pid', 'lang', 'title', 'uri', 'priority'],
  'slider':                 ['id', 'translationId', 'lang', 'uri', 'img', 'title', 'descr', 'priority', 'img2'],
  'articles':               ['id', 'translationId', 'lang', 'uri', 'data', 'img', 'title',
                             'descr', 'text', 'priority', 'seoTitle', 'seoKey', 'seoDescr'],
  'articles_photos':        ['id', 'pid', 'img', 'priority'],
  'news':                   ['id', 'translationId', 'lang', 'uri', 'data', 'img', 'title',
                             'descr', 'text', 'priority'],
  'news_photos':            ['id', 'pid', 'img', 'priority'],
  'services':               ['id', 'translationId', 'lang', 'img', 'title', 'descr', 'priority'],
  'managers':               ['id', 'translationId', 'lang', 'img', 'title', 'descr', 'phone',
                             'email', 'skype', 'priority'],
  'gallery':                ['id', 'img'],
  'users':                  ['id', 'login', 'password', 'rank', 'addrDelivery', 'phone', 'person'],
  'users_categories':       ['id', 'translationId', 'lang', 'title', 'discount', 'discount_total', 'priority'],
  // Skipped: MySQL has login+hash only; token (required) doesn't map cleanly; data is stale anyway
  'cart':                   ['id', 'login', 'type', 'product', 'price', 'quantity', 'add_time', 'reminded'],
  'orders':                 ['id', 'date', 'login', 'person', 'phone', 'addrDelivery', 'ttn',
                             'status', 'notes', 'pay_method', 'currency', 'msg', 'callme'],
  'orders_item':            ['id', 'oid', 'type', 'product', 'price', 'quantity', 'price_base'],
  'orders_returns':         ['id', 'date', 'login', 'person', 'phone', 'title', 'quantity',
                             'reason', 'status', 'notes'],
  'docs':                   ['id', 'lang', 'file', 'title', 'priority'],
};

// all_filters_items in Supabase maps to all_filters_filters_items in MySQL
const REMAP_SOURCES = {
  'all_filters_items': { mysqlTable: 'all_filters_filters_items', columns: ['id', 'pid', 'fid'] },
};

// Import order respects FK dependencies
const TABLE_ORDER = [
  'langs', 'currency', 'adm_users', 'adm_login_fails',
  'settings', 'settings_text', 'custom_strings', 'socials', 'core',
  'measures', 'measures_real',
  'users', 'users_categories', 'users_recover_password',
  'docs', 'gallery',
  'all_filters', 'all_filters_filters',
  'slider',
  'categories',
  'products',
  'products_categories', 'products_photos', 'products_photos2',
  'products_chars', 'products_colors', 'products_together',
  'products_favourites',
  'all_filters_items',
  'articles', 'articles_photos',
  'news', 'news_photos',
  'services', 'managers',
  'cart', 'orders', 'orders_item', 'orders_returns',
];

// --- Parsing ---

function parseColumnDefs(lines, startIdx) {
  const cols = [];
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith(')')) break;
    const m = line.match(/^`(\w+)`/);
    if (m) cols.push(m[1]);
    i++;
  }
  return cols;
}

// Parse a single row of MySQL values: "v1,v2,'string',NULL"
function parseValues(str) {
  const vals = [];
  let i = 0;
  let cur = '';

  while (i <= str.length) {
    const ch = str[i];
    if (i === str.length || ch === ',') {
      vals.push(cur);
      cur = '';
      i++;
    } else if (ch === "'") {
      cur += ch;
      i++;
      while (i < str.length) {
        if (str[i] === '\\') {
          cur += str[i] + (str[i + 1] || '');
          i += 2;
        } else if (str[i] === "'") {
          cur += str[i];
          i++;
          break;
        } else {
          cur += str[i];
          i++;
        }
      }
    } else {
      cur += ch;
      i++;
    }
  }
  return vals;
}

// Split REPLACE INTO ... VALUES (row),(row),... into individual row strings
function splitRows(valuesSection) {
  const rows = [];
  let i = 0;
  const s = valuesSection;
  while (i < s.length) {
    if (s[i] !== '(') { i++; continue; }
    let depth = 1;
    let j = i + 1;
    let rowStr = '';
    while (j < s.length && depth > 0) {
      const c = s[j];
      if (c === "'") {
        rowStr += c; j++;
        while (j < s.length) {
          if (s[j] === '\\') { rowStr += s[j] + (s[j+1]||''); j += 2; }
          else if (s[j] === "'") { rowStr += s[j]; j++; break; }
          else { rowStr += s[j]; j++; }
        }
      } else if (c === '(') { depth++; rowStr += c; j++; }
      else if (c === ')') { depth--; if (depth > 0) { rowStr += c; } j++; }
      else { rowStr += c; j++; }
    }
    rows.push(rowStr);
    i = j;
  }
  return rows;
}

// Convert a MySQL value token to PostgreSQL-safe literal
function toPg(val) {
  const v = val.trim();
  if (v === 'NULL') return 'NULL';
  if (v.startsWith("'")) {
    // Always use E-string so MySQL backslash escapes work in PostgreSQL
    const inner = v.slice(1, -1);
    return `E'${inner}'`;
  }
  return v; // number, true, false
}

// --- Main ---

function main() {
  console.log('Reading dump...');
  const content = fs.readFileSync(DUMP_FILE, 'utf8');
  const lines = content.split('\n');

  // Phase 1: parse CREATE TABLE → column names per table
  const tableColumns = {}; // tableName → [col1, col2, ...]
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^CREATE TABLE `(\w+)`/);
    if (m) {
      tableColumns[m[1]] = parseColumnDefs(lines, i + 1);
    }
  }

  // Phase 2: parse REPLACE INTO / INSERT INTO → rows per table
  const tableData = {}; // tableName → [{col: value, ...}]
  // REPLACE INTO lines are single very long lines
  for (const line of lines) {
    const m = line.match(/^REPLACE INTO `(\w+)` VALUES (.+);?\s*$/s);
    if (!m) continue;
    const tbl = m[1];
    const cols = tableColumns[tbl];
    if (!cols) continue;

    const rows = splitRows(m[2]);
    const parsed = [];
    for (const rowStr of rows) {
      const vals = parseValues(rowStr);
      const obj = {};
      for (let c = 0; c < cols.length && c < vals.length; c++) {
        obj[cols[c]] = vals[c];
      }
      parsed.push(obj);
    }
    tableData[tbl] = parsed;
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Phase 3: generate SQL files per table
  const allTables = [...TABLE_ORDER];
  // add tables in REMAP_SOURCES that aren't already there
  for (const [pgTable] of Object.entries(REMAP_SOURCES)) {
    if (!allTables.includes(pgTable)) allTables.splice(allTables.indexOf('all_filters_filters') + 1, 0, pgTable);
  }

  const summary = [];
  let fileIdx = 1;

  // Header file
  const header = [
    '-- Supabase data import - generated by migrate-to-supabase.js',
    '-- Run files in numbered order via Supabase SQL Editor',
    '',
    'SET session_replication_role = replica; -- disable FK checks',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, '00_header.sql'), header);

  for (const pgTable of allTables) {
    let mysqlTable = pgTable;
    let wantedCols = COLUMN_MAPS[pgTable];

    if (REMAP_SOURCES[pgTable]) {
      mysqlTable = REMAP_SOURCES[pgTable].mysqlTable;
      wantedCols = REMAP_SOURCES[pgTable].columns;
    }

    if (!wantedCols) {
      console.log(`  SKIP ${pgTable}: no column map defined`);
      continue;
    }

    const srcCols = tableColumns[mysqlTable] || [];
    const rows = tableData[mysqlTable] || [];

    // Intersect: only columns that exist in the MySQL dump
    const useCols = wantedCols.filter(c => srcCols.includes(c));
    const missing = wantedCols.filter(c => !srcCols.includes(c));
    if (missing.length) {
      console.log(`  NOTE ${pgTable}: columns not found in MySQL → skipped: ${missing.join(', ')}`);
    }

    if (useCols.length === 0) {
      console.log(`  SKIP ${pgTable}: no usable columns`);
      continue;
    }

    const sqlLines = [
      `-- ${pgTable} (${rows.length} rows from MySQL \`${mysqlTable}\`)`,
    ];

    if (rows.length === 0) {
      sqlLines.push('-- (no data)');
    } else {
      const quotedCols = useCols.map(c => `"${c}"`).join(', ');
      for (const row of rows) {
        const vals = useCols.map(c => toPg(row[c] !== undefined ? row[c] : 'NULL')).join(', ');
        sqlLines.push(`INSERT INTO "${pgTable}" (${quotedCols}) VALUES (${vals}) ON CONFLICT DO NOTHING;`);
      }

      // Reset auto-increment sequence
      const idMax = rows.reduce((mx, r) => {
        const v = parseInt(r['id']);
        return isNaN(v) ? mx : Math.max(mx, v);
      }, 0);
      if (idMax > 0) {
        sqlLines.push(`SELECT setval(pg_get_serial_sequence('"${pgTable}"', 'id'), ${idMax}, true);`);
      }
    }

    const fileName = `${String(fileIdx).padStart(2, '0')}_${pgTable}.sql`;
    fs.writeFileSync(path.join(OUT_DIR, fileName), sqlLines.join('\n') + '\n');
    console.log(`  ✓ ${fileName}: ${rows.length} rows (${useCols.length} cols)`);
    summary.push(`${fileName}: ${rows.length} rows`);
    fileIdx++;
  }

  // Footer file
  fs.writeFileSync(path.join(OUT_DIR, `${String(fileIdx).padStart(2, '0')}_footer.sql`),
    'SET session_replication_role = DEFAULT; -- re-enable FK checks\n');

  console.log('\nDone. Files saved to: ' + OUT_DIR);
  console.log('\nNext steps:');
  console.log('  1. In Supabase SQL Editor, run 00_header.sql first');
  console.log('  2. Run each numbered .sql file in order');
  console.log(`  3. Run ${String(fileIdx).padStart(2, '0')}_footer.sql last`);
  console.log('\nOR: allow "npm install pg" and run node scripts/import-to-supabase.js to do it automatically');
}

main();
