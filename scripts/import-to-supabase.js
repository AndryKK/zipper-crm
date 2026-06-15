// Imports MySQL dump directly to Supabase via HTTPS REST API.
// Run: node scripts/import-to-supabase.js
// No external packages — uses built-in https only.
// Encoding: data flows as JS Unicode strings → JSON UTF-8 → Supabase. No corruption.

const https = require('https');
const fs = require('fs');
const path = require('path');

// --- Config ---
const DUMP_FILE = path.join(__dirname, 'dump-extracted', 'mysql_mozar24_zipper.2026-06-01_1706.sql');
const BATCH_SIZE = 300; // rows per HTTP request

function readEnv() {
  const env = {};
  const raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\w+)=(.+)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '').trim();
  }
  return env;
}
const env = readEnv();
const API_KEY = env.SUPABASE_SECRET_KEY;
const PROJECT = 'ncjcqfqcmsjsqhxjkqxh';
const HOST = `${PROJECT}.supabase.co`;

// --- REST API helper ---
function supabasePost(table, rows) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(rows);
    const buf = Buffer.from(body, 'utf8');
    const req = https.request({
      hostname: HOST,
      port: 443,
      path: `/rest/v1/${table}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': buf.length,
        'Authorization': `Bearer ${API_KEY}`,
        'apikey': API_KEY,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode} on ${table}: ${data.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// Test connection
function testConnection() {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: HOST, port: 443,
      path: '/rest/v1/langs?limit=1',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'apikey': API_KEY },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });
}

// --- MySQL dump parsing ---

function parseColumnDefs(lines, startIdx) {
  const cols = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith(')')) break;
    const m = line.match(/^`(\w+)`/);
    if (m) cols.push(m[1]);
  }
  return cols;
}

// Unescape MySQL string escape sequences → proper Unicode string
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

// Parse one value token from REPLACE INTO VALUES row
function toJs(token) {
  const v = token.trim();
  if (v === 'NULL') return null;
  if (v.startsWith("'")) {
    return unescapeMySQL(v.slice(1, -1));
  }
  const n = Number(v);
  if (v !== '' && !isNaN(n)) return n;
  return v;
}

// Split "v1,v2,'str with, comma',NULL" into tokens
function parseValues(str) {
  const vals = [];
  let i = 0, cur = '';
  while (i <= str.length) {
    if (i === str.length || str[i] === ',') {
      vals.push(cur); cur = ''; i++;
    } else if (str[i] === "'") {
      cur += str[i]; i++;
      while (i < str.length) {
        if (str[i] === '\\') { cur += str[i] + (str[i + 1] || ''); i += 2; }
        else if (str[i] === "'") { cur += str[i]; i++; break; }
        else { cur += str[i]; i++; }
      }
    } else { cur += str[i]; i++; }
  }
  return vals;
}

// Split REPLACE INTO VALUES (row1),(row2),... into row strings
function splitRows(valuesStr) {
  const rows = [];
  let i = 0;
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
    rows.push(rowStr);
    i = j;
  }
  return rows;
}

// --- Column maps: MySQL source cols → what to send to Supabase ---
// Only include columns that exist in BOTH the MySQL dump AND Prisma schema
const COLUMN_MAPS = {
  'adm_login_fails':     ['id', 'ip', 'data', 'times'],
  'adm_users':           ['id', 'status', 'login', 'pass'],
  'langs':               ['id', 'code', 'flag', 'title', 'active', 'visibility', 'priority'],
  'currency':            ['id', 'title', 'rate', 'uri', 'enabled'],
  'settings':            ['id', 'value', 'text', 'lang'],
  'settings_text':       ['id', 'value', 'text', 'lang'],
  'custom_strings':      ['id', 'value', 'text', 'lang'],
  'socials':             ['id', 'icon', 'title', 'text', 'priority', 'enabled'],
  'core':                ['id', 'uri', 'lang', 'heading', 'text', 'text2', 'seoTitle', 'seoKey', 'seoDescr'],
  'measures':            ['id', 'translationId', 'lang', 'title', 'short_title', 'priority'],
  'measures_real':       ['id', 'translationId', 'lang', 'title', 'short_title', 'priority'],
  'categories':          ['id', 'translationId', 'lang', 'pid', 'title', 'uri', 'img', 'img2',
                          'discount', 'ndiscount', 'visibility', 'priority', 'descr', 'text',
                          'seoTitle', 'seoKey', 'seoDescr'],
  'products':            ['id', 'translationId', 'lang', 'pid', 'filterId', 'pcode', 'uri',
                          'img', 'img2', 'title', 'main_title', 'heading', 'package', 'price',
                          'price_sale', 'price2n', 'price2', 'price3n', 'price3', 'labelAction',
                          'text', 'priority', 'popular', 'measure', 'minquantity', 'descr',
                          'seoTitle', 'seoKey', 'active'],
  'products_categories': ['id', 'pid', 'cid'],
  'products_photos':     ['id', 'pid', 'img', 'priority'],
  'products_photos2':    ['id', 'pid', 'img', 'priority'],
  'products_chars':      ['id', 'lang', 'pid', 'chid', 'title'],
  'products_colors':     ['id', 'pid', 'pid_with'],
  'products_together':   ['id', 'pid', 'pid_with'],
  'all_filters':         ['id', 'translationId', 'pid', 'lang', 'uri', 'img', 'title', 'descr', 'priority'],
  'all_filters_filters': ['id', 'translationId', 'pid', 'lang', 'title', 'uri', 'priority'],
  'slider':              ['id', 'translationId', 'lang', 'uri', 'img', 'title', 'descr', 'priority', 'img2'],
  'articles':            ['id', 'translationId', 'lang', 'uri', 'data', 'img', 'title',
                          'descr', 'text', 'priority', 'seoTitle', 'seoKey', 'seoDescr'],
  'articles_photos':     ['id', 'pid', 'img', 'priority'],
  'news':                ['id', 'translationId', 'lang', 'uri', 'data', 'img', 'title',
                          'descr', 'text', 'priority'],
  'news_photos':         ['id', 'pid', 'img', 'priority'],
  'services':            ['id', 'translationId', 'lang', 'img', 'title', 'descr', 'priority'],
  'managers':            ['id', 'translationId', 'lang', 'img', 'title', 'descr',
                          'phone', 'email', 'skype', 'priority'],
  'gallery':             ['id', 'img'],
  'users':               ['id', 'login', 'password', 'rank', 'addrDelivery', 'phone', 'person'],
  'users_categories':    ['id', 'translationId', 'lang', 'title', 'discount', 'discount_total', 'priority'],
  'cart':                ['id', 'login', 'type', 'product', 'price', 'quantity', 'add_time', 'reminded'],
  'orders':              ['id', 'date', 'login', 'person', 'phone', 'addrDelivery', 'ttn',
                          'status', 'notes', 'pay_method', 'currency', 'msg', 'callme'],
  'orders_item':         ['id', 'oid', 'type', 'product', 'price', 'quantity', 'price_base'],
  'orders_returns':      ['id', 'date', 'login', 'person', 'phone', 'title', 'quantity',
                          'reason', 'status', 'notes'],
  'docs':                ['id', 'lang', 'file', 'title', 'priority'],
};

// Special: Supabase table ← different MySQL source table
const REMAP = {
  'all_filters_items': { from: 'all_filters_filters_items', cols: ['id', 'pid', 'fid'] },
};

// Import order (FK-safe: parents before children)
const TABLE_ORDER = [
  'langs', 'currency', 'adm_users', 'adm_login_fails',
  'settings', 'settings_text', 'custom_strings', 'socials', 'core',
  'measures', 'measures_real',
  'users', 'users_categories',
  'docs', 'gallery',
  'all_filters', 'all_filters_filters',
  'slider', 'categories',
  'products',
  'products_categories', 'products_photos', 'products_photos2',
  'products_chars', 'products_colors', 'products_together',
  'all_filters_items',
  'articles', 'articles_photos',
  'news', 'news_photos',
  'services', 'managers',
  'cart', 'orders', 'orders_item', 'orders_returns',
];

// --- Main ---
async function main() {
  if (!API_KEY) {
    console.error('SUPABASE_SECRET_KEY not found in .env');
    process.exit(1);
  }

  // Test connectivity
  process.stdout.write('Testing Supabase connection... ');
  const test = await testConnection();
  if (test.status === 401 || test.status === 403) {
    console.error(`\nAuth failed (HTTP ${test.status}). Check SUPABASE_SECRET_KEY in .env`);
    process.exit(1);
  }
  if (test.status === 404) {
    console.error('\nTable "langs" not found. Run: npx prisma db push (requires Supabase to be reachable on port 5432)');
    console.error('Or create tables manually in Supabase SQL Editor using supabase-import/00_header.sql schema.');
    process.exit(1);
  }
  console.log(`OK (HTTP ${test.status})`);

  // Parse dump
  console.log('Parsing MySQL dump...');
  const content = fs.readFileSync(DUMP_FILE, 'utf8');
  const lines = content.split('\n');

  // Extract column definitions per table
  const tableColumns = {};
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^CREATE TABLE `(\w+)`/);
    if (m) tableColumns[m[1]] = parseColumnDefs(lines, i + 1);
  }

  // Extract row data per table (REPLACE INTO lines are single long lines)
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
      for (let c = 0; c < cols.length && c < vals.length; c++) {
        obj[cols[c]] = toJs(vals[c]);
      }
      return obj;
    });
  }
  console.log('Dump parsed.\n');

  let totalInserted = 0;
  let totalErrors = 0;

  for (const pgTable of TABLE_ORDER) {
    let srcTable = pgTable;
    let wantedCols = COLUMN_MAPS[pgTable];

    if (REMAP[pgTable]) {
      srcTable = REMAP[pgTable].from;
      wantedCols = REMAP[pgTable].cols;
    }

    if (!wantedCols) continue;

    const srcCols = tableColumns[srcTable] || [];
    const allRows = tableData[srcTable] || [];
    const useCols = wantedCols.filter(c => srcCols.includes(c));

    if (useCols.length === 0) {
      console.log(`  SKIP ${pgTable}: no matching columns in dump`);
      continue;
    }

    // Build objects with only useCols
    const rows = allRows.map(row => {
      const obj = {};
      for (const c of useCols) obj[c] = row[c] !== undefined ? row[c] : null;
      return obj;
    });

    if (rows.length === 0) {
      console.log(`  -- ${pgTable}: 0 rows`);
      continue;
    }

    process.stdout.write(`  ${pgTable}: ${rows.length} rows... `);
    let inserted = 0;
    let errored = false;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      try {
        await supabasePost(pgTable, batch);
        inserted += batch.length;
      } catch (e) {
        process.stdout.write(`\n    ERROR batch ${i}-${i+batch.length}: ${e.message}\n  `);
        errored = true;
        totalErrors++;
        break;
      }
    }

    if (!errored) {
      console.log(`✓ ${inserted} inserted`);
      totalInserted += inserted;
    }
  }

  console.log(`\nDone. Total inserted: ${totalInserted} rows. Errors: ${totalErrors}`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
