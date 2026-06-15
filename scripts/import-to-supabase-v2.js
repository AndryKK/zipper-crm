// v2: imports MySQL dump to Supabase with correct camelCase→snake_case column mapping.
// Auto-fetches Supabase schema to know which columns exist.
// Run: node scripts/import-to-supabase-v2.js

const https = require('https');
const fs = require('fs');
const path = require('path');

const DUMP_FILE = path.join(__dirname, 'dump-extracted', 'mysql_mozar24_zipper.2026-06-01_1706.sql');
const BATCH_SIZE = 300;

function readEnv() {
  const env = {};
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n').forEach(l => {
    const m = l.match(/^(\w+)=(.+)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '').trim();
  });
  return env;
}
const env = readEnv();
const API_KEY = env.SUPABASE_SECRET_KEY;
const HOST = 'ncjcqfqcmsjsqhxjkqxh.supabase.co';

// --- HTTP helpers ---
function get(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get({ hostname: HOST, port: 443, path: urlPath,
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'apikey': API_KEY, ...headers },
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

function post(urlPath, rows, prefer = 'resolution=merge-duplicates,return=minimal') {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(rows), 'utf8');
    const req = https.request({
      hostname: HOST, port: 443, path: urlPath, method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'Content-Length': buf.length,
        'Authorization': `Bearer ${API_KEY}`, 'apikey': API_KEY,
        'Prefer': prefer,
      },
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`HTTP ${res.statusCode}: ${d.slice(0, 400)}`));
      });
    });
    req.on('error', reject);
    req.write(buf); req.end();
  });
}

// --- Fetch Supabase table schemas via OpenAPI ---
async function fetchSupabaseSchema() {
  const r = await get('/rest/v1/');
  const spec = JSON.parse(r.body);
  const schema = {};
  for (const [table, def] of Object.entries(spec.definitions || {})) {
    schema[table] = new Set(Object.keys(def.properties || {}));
  }
  return schema;
}

// --- MySQL dump parsing ---
function parseColumnDefs(lines, startIdx) {
  const cols = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith(')')) break;
    const m = line.match(/^`(\S+?)`/); // \S+ handles `1c`, `1`, etc.
    if (m) cols.push(m[1]);
  }
  return cols;
}

function unescapeMySQL(s) {
  return s.replace(/\\([\s\S])/g, (_, c) => {
    switch (c) {
      case 'n':  return '\n';
      case 'r':  return '\r';
      case 't':  return '\t';
      case '\\': return '\\';
      case "'":  return "'";
      case '"':  return '"';
      case '0':  return '\0';
      case 'b':  return '\b';
      case 'Z':  return '\x1a';
      default:   return c;
    }
  });
}

function toJs(token) {
  const v = token.trim();
  if (v === 'NULL') return null;
  if (v.startsWith("'")) return unescapeMySQL(v.slice(1, -1));
  const n = Number(v);
  return (v !== '' && !isNaN(n)) ? n : v;
}

function parseValues(str) {
  const vals = []; let i = 0, cur = '';
  while (i <= str.length) {
    if (i === str.length || str[i] === ',') { vals.push(cur); cur = ''; i++; }
    else if (str[i] === "'") {
      cur += str[i]; i++;
      while (i < str.length) {
        if (str[i] === '\\') { cur += str[i] + (str[i+1]||''); i += 2; }
        else if (str[i] === "'") { cur += str[i]; i++; break; }
        else { cur += str[i]; i++; }
      }
    } else { cur += str[i]; i++; }
  }
  return vals;
}

function splitRows(valuesStr) {
  const rows = []; let i = 0;
  while (i < valuesStr.length) {
    if (valuesStr[i] !== '(') { i++; continue; }
    let depth = 1, j = i + 1, rowStr = '';
    while (j < valuesStr.length && depth > 0) {
      const c = valuesStr[j];
      if (c === "'") {
        rowStr += c; j++;
        while (j < valuesStr.length) {
          if (valuesStr[j] === '\\') { rowStr += valuesStr[j] + (valuesStr[j+1]||''); j += 2; }
          else if (valuesStr[j] === "'") { rowStr += valuesStr[j]; j++; break; }
          else { rowStr += valuesStr[j]; j++; }
        }
      } else if (c === '(') { depth++; rowStr += c; j++; }
      else if (c === ')') { depth--; if (depth > 0) rowStr += c; j++; }
      else { rowStr += c; j++; }
    }
    rows.push(rowStr); i = j;
  }
  return rows;
}

// --- Column name conversion: MySQL camelCase → Supabase snake_case ---
const EXPLICIT_RENAMES = {
  'seoheadingVar': 'seo_heading_var',
  '1': 'doc_field_1',
  '2': 'doc_field_2',
  '3': 'doc_field_3',
  '1c': 'sync_1c',
};

function toSnakeCase(col) {
  if (EXPLICIT_RENAMES[col]) return EXPLICIT_RENAMES[col];
  return col.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
}

// Build a Supabase row from a MySQL row, filtering to only known Supabase cols
function convertRow(mysqlRow, mysqlCols, supabaseCols) {
  const result = {};
  for (const mCol of mysqlCols) {
    const sCol = toSnakeCase(mCol);
    if (supabaseCols.has(sCol)) {
      const val = mysqlRow[mCol];
      result[sCol] = val !== undefined ? val : null;
    }
  }
  return result;
}

// --- Import configuration ---
// Tables: pg_table → { mysqlTable?, onConflict? }
// mysqlTable: use a different MySQL source (default = same as pg_table)
// onConflict: URL param for ?on_conflict=... (default = no param, uses PK)
const TABLE_CONFIG = {
  'adm_login_fails':     {},
  'adm_users':           { onConflict: 'login' },  // conflict on unique login
  'langs':               {},
  'currency':            {},
  'settings':            {},
  'settings_text':       {},
  'custom_strings':      {},
  'socials':             {},
  'core':                {},
  'measures':            {},
  'measures_real':       {},
  'users':               { onConflict: 'login' },
  'users_categories':    {},
  'docs':                {},
  'gallery':             {},
  'all_filters':         {},
  'all_filters_filters': {},
  'all_filters_items':   {},  // direct from MySQL all_filters_items (cid, fid)
  'slider':              {},
  'categories':          {},
  'products':            {},
  'products_categories': {},
  'products_photos':     {},
  'products_photos2':    {},
  'products_chars':      {},
  'products_colors':     {},
  'products_together':   {},
  'articles':            {},
  'articles_photos':     {},
  'news':                {},
  'news_photos':         {},
  'services':            {},
  'managers':            {},
  'cart':                {},
  'orders':              {},
  'orders_item':         {},
  'orders_returns':      {},
};

const TABLE_ORDER = Object.keys(TABLE_CONFIG);

// --- Main ---
async function main() {
  if (!API_KEY) { console.error('SUPABASE_SECRET_KEY not in .env'); process.exit(1); }

  // Test & fetch schema
  process.stdout.write('Fetching Supabase table schemas... ');
  const supabaseSchema = await fetchSupabaseSchema();
  console.log(`${Object.keys(supabaseSchema).length} tables found`);

  // Parse dump
  console.log('Parsing MySQL dump...');
  const content = fs.readFileSync(DUMP_FILE, 'utf8');
  const lines = content.split('\n');

  const tableColumns = {};
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^CREATE TABLE `(\w+)`/);
    if (m) tableColumns[m[1]] = parseColumnDefs(lines, i + 1);
  }

  const tableData = {};
  for (const line of lines) {
    const m = line.match(/^REPLACE INTO `(\w+)` VALUES (.+?);?\s*$/s);
    if (!m) continue;
    const tbl = m[1];
    const cols = tableColumns[tbl];
    if (!cols) continue;
    const rows = splitRows(m[2]);
    tableData[tbl] = rows.map(rowStr => {
      const vals = parseValues(rowStr);
      const obj = {};
      for (let c = 0; c < cols.length && c < vals.length; c++) obj[cols[c]] = toJs(vals[c]);
      return obj;
    });
  }
  console.log('Dump parsed.\n');

  let totalInserted = 0, totalErrors = 0;

  for (const pgTable of TABLE_ORDER) {
    const cfg = TABLE_CONFIG[pgTable];
    const mysqlTable = cfg.mysqlTable || pgTable;
    const supabaseCols = supabaseSchema[pgTable];

    if (!supabaseCols) {
      console.log(`  SKIP ${pgTable}: not found in Supabase`);
      continue;
    }

    const mysqlCols = tableColumns[mysqlTable];
    const allMysqlRows = tableData[mysqlTable] || [];

    if (!mysqlCols) {
      console.log(`  SKIP ${pgTable}: no MySQL source table "${mysqlTable}"`);
      continue;
    }

    // Convert rows
    let rows = allMysqlRows
      .map(r => convertRow(r, mysqlCols, supabaseCols))
      .filter(r => Object.keys(r).length > 0);

    // Deduplicate by conflict key if specified (prevents "row affected twice" error)
    if (cfg.onConflict) {
      const seen = new Map();
      for (const r of rows) {
        const key = r[cfg.onConflict];
        if (key !== undefined) seen.set(key, r);
      }
      rows = [...seen.values()];
    }

    if (rows.length === 0) {
      console.log(`  -- ${pgTable}: 0 rows`);
      continue;
    }

    const urlPath = cfg.onConflict
      ? `/rest/v1/${pgTable}?on_conflict=${cfg.onConflict}`
      : `/rest/v1/${pgTable}`;

    process.stdout.write(`  ${pgTable}: ${rows.length} rows... `);

    let inserted = 0, errored = false;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      try {
        await post(urlPath, batch);
        inserted += batch.length;
      } catch (e) {
        process.stdout.write(`\n    ERR batch ${i}-${i+batch.length}: ${e.message}\n  `);
        errored = true; totalErrors++;
        break;
      }
    }

    if (!errored) { console.log(`✓ ${inserted}`); totalInserted += inserted; }
  }

  console.log(`\nDone. Inserted: ${totalInserted} rows. Errors: ${totalErrors}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
