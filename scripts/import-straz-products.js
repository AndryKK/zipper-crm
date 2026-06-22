/**
 * Imports missing "Блискавки зі стразами" products (category 48/183) from MySQL dump.
 *
 * What it does:
 *  1. Parses the MySQL dump and extracts products 748-776 (missing from Supabase)
 *  2. Inserts RU products with their original IDs
 *  3. Creates UK duplicates (same translation_id, new auto-IDs from Supabase)
 *  4. Links: ru products → category 48, uk products → category 183
 *  5. Imports products_photos for both ru + uk products
 *
 * Run: node scripts/import-straz-products.js
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── Config ────────────────────────────────────────────────────────────────
const DUMP_FILE  = path.join(__dirname, 'dump-extracted', 'mysql_mozar24_zipper.2026-06-01_1706.sql');
const ENV_FILE   = path.join(__dirname, '..', '.env');
const BATCH_SIZE = 50;

const CAT_RU = 48;
const CAT_UK = 183;
const SUPABASE_MIN_ID = 8723;  // Products already in Supabase start here

// MySQL products columns (in order they appear in dump VALUES)
const MYSQL_PRODUCT_COLS = [
  'id', 'translationId', 'pid', 'filterId', 'lang', 'uri', 'pcode',
  'img', 'img2', 'title', 'main_title', 'heading', 'package',
  'price', 'price2n', 'price2', 'price3n', 'price3',
  'labelAction', 'main_count', 'square', 'add_place', 'sq1', 'sq2', 'sq3',
  'price_sale', 'sale', 'text', 'priority', 'popular', 'measure',
  'minquantity', 'descr', 'map', 'seoTitle', 'seoDescr', 'seoKey',
  'seoText', 'active', 'xml_id', 'xml_cat', '1c',
];

// Supabase products columns (snake_case, subset of MySQL)
const SUPA_PRODUCT_COLS = [
  'id', 'translation_id', 'lang', 'pid', 'filter_id', 'pcode', 'uri',
  'img', 'img2', 'title', 'main_title', 'heading', 'package',
  'price', 'price_sale', 'price2n', 'price2', 'price3n', 'price3',
  'label_action', 'text', 'priority', 'popular', 'measure',
  'minquantity', 'descr', 'seo_title', 'seo_key', 'active',
];

// MySQL → Supabase column name map
const COL_MAP = {
  id:           'id',
  translationId:'translation_id',
  pid:          'pid',
  filterId:     'filter_id',
  lang:         'lang',
  uri:          'uri',
  pcode:        'pcode',
  img:          'img',
  img2:         'img2',
  title:        'title',
  main_title:   'main_title',
  heading:      'heading',
  package:      'package',
  price:        'price',
  price_sale:   'price_sale',
  price2n:      'price2n',
  price2:       'price2',
  price3n:      'price3n',
  price3:       'price3',
  labelAction:  'label_action',
  text:         'text',
  priority:     'priority',
  popular:      'popular',
  measure:      'measure',
  minquantity:  'minquantity',
  descr:        'descr',
  seoTitle:     'seo_title',
  seoKey:       'seo_key',
  active:       'active',
};

// ─── Env ────────────────────────────────────────────────────────────────────
function readEnv() {
  const env = {};
  fs.readFileSync(ENV_FILE, 'utf8').split('\n').forEach(l => {
    const m = l.match(/^(\w+)="?([^"]*)"?$/);
    if (m) env[m[1]] = m[2].trim();
  });
  return env;
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────
let API_KEY, HOST;

function supaPost(table, rows, prefer = 'resolution=merge-duplicates,return=representation') {
  return new Promise((resolve, reject) => {
    if (!rows.length) return resolve([]);
    const buf = Buffer.from(JSON.stringify(rows), 'utf8');
    const req = https.request({
      hostname: HOST, port: 443,
      path: `/rest/v1/${table}`,
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': buf.length,
        'Authorization':  `Bearer ${API_KEY}`,
        'apikey':          API_KEY,
        'Prefer':          prefer,
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(d)); } catch { resolve([]); }
        } else {
          reject(new Error(`POST ${table} → HTTP ${res.statusCode}: ${d.slice(0, 500)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// ─── MySQL dump parsing ───────────────────────────────────────────────────────
function unescapeMySQL(s) {
  return s.replace(/\\([\s\S])/g, (_, c) => {
    const map = { n:'\n', r:'\r', t:'\t', '\\':'\\', "'":"'", '"':'"', '0':'\0', b:'\b', Z:'\x1a' };
    return map[c] ?? c;
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
    if (i === str.length || str[i] === ',') {
      vals.push(cur); cur = ''; i++;
    } else if (str[i] === "'") {
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

function extractSection(content, tableName) {
  const re = new RegExp(`LOCK TABLES \`${tableName}\` WRITE;([\\s\\S]*?)UNLOCK TABLES;`);
  const m = content.match(re);
  return m ? m[1] : '';
}

function parseTable(content, tableName) {
  const section = extractSection(content, tableName);
  const m = section.match(/(?:REPLACE|INSERT) INTO `\S+` VALUES\s*([\s\S]+?);?\s*$/);
  if (!m) return { cols: [], rows: [] };

  // Get column order from CREATE TABLE
  const createRe = new RegExp(`CREATE TABLE \`${tableName}\` \\(([\\s\\S]*?)\\) ENGINE`);
  const cm = content.match(createRe);
  const cols = [];
  if (cm) {
    for (const line of cm[1].split('\n')) {
      const lm = line.trim().match(/^`(\S+?)`/);
      if (lm) cols.push(lm[1]);
    }
  }

  const rowsRaw = splitRows(m[1]);
  const rows = rowsRaw.map(raw => {
    const vals = parseValues(raw).map(toJs);
    const obj = {};
    cols.forEach((col, i) => { obj[col] = vals[i] !== undefined ? vals[i] : null; });
    return obj;
  });

  return { cols, rows };
}

// ─── Convert MySQL product row → Supabase row ────────────────────────────────
function toSupabaseProduct(mysqlRow, overrides = {}) {
  const row = {};
  for (const [mCol, sCol] of Object.entries(COL_MAP)) {
    if (mysqlRow[mCol] !== undefined) row[sCol] = mysqlRow[mCol];
  }
  return { ...row, ...overrides };
}

// ─── Insert in batches ────────────────────────────────────────────────────────
async function batchInsert(table, rows, prefer) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const result = await supaPost(table, batch, prefer);
    inserted += Array.isArray(result) ? result.length : batch.length;
  }
  return inserted;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const env = readEnv();
  API_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  HOST    = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;

  if (!API_KEY || !HOST) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL in .env');
    process.exit(1);
  }

  console.log(`Host: ${HOST}`);
  console.log(`Reading dump: ${DUMP_FILE}\n`);

  const content = fs.readFileSync(DUMP_FILE, 'utf8');

  // ── Step 1: Find product IDs in category 48 not yet in Supabase ─────────────
  console.log('[1] Scanning products_categories for missing products in category 48...');
  const { rows: pcRows } = parseTable(content, 'products_categories');

  const missingIds = new Set();
  const pcLinksRu  = [];  // (id, pid, cid=48) — original links

  for (const row of pcRows) {
    if (row.cid === CAT_RU && row.pid < SUPABASE_MIN_ID) {
      missingIds.add(row.pid);
      pcLinksRu.push({ id: row.id, pid: row.pid, cid: CAT_RU });
    }
  }

  console.log(`    Missing product IDs: [${[...missingIds].sort((a,b)=>a-b).join(', ')}]`);
  console.log(`    Count: ${missingIds.size}\n`);

  if (missingIds.size === 0) {
    console.log('Nothing to import.');
    return;
  }

  // ── Step 2: Extract product records from dump ────────────────────────────────
  console.log('[2] Parsing products table...');
  const { rows: allProducts } = parseTable(content, 'products');
  console.log(`    Total products in dump: ${allProducts.length}`);

  const ruProducts = allProducts.filter(p => missingIds.has(p.id));
  console.log(`    Matched products: ${ruProducts.length}`);

  const stillMissing = [...missingIds].filter(id => !ruProducts.find(p => p.id === id));
  if (stillMissing.length) {
    console.warn(`    ⚠ IDs not found in dump: [${stillMissing.join(', ')}]`);
  }

  // ── Step 3: Extract photos ────────────────────────────────────────────────────
  console.log('\n[3] Parsing product photos...');
  const { rows: allPhotos }  = parseTable(content, 'products_photos');
  const { rows: allPhotos2 } = parseTable(content, 'products_photos2');

  const ruPhotos  = allPhotos.filter(p  => missingIds.has(p.pid));
  const ruPhotos2 = allPhotos2.filter(p => missingIds.has(p.pid));
  console.log(`    products_photos:  ${ruPhotos.length}`);
  console.log(`    products_photos2: ${ruPhotos2.length}`);

  // ── Step 4: Insert RU products ────────────────────────────────────────────────
  console.log('\n[4] Inserting RU products...');
  const supaRuProducts = ruProducts.map(p => toSupabaseProduct(p));
  const ruInserted = await batchInsert('products', supaRuProducts,
    'resolution=merge-duplicates,return=minimal');
  console.log(`    Inserted/updated: ${supaRuProducts.length} rows`);

  // ── Step 5: Insert UK products (copies with lang='uk', new auto IDs) ──────────
  console.log('\n[5] Inserting UK products (lang=uk, auto-generated IDs)...');
  const ukDrafts = ruProducts.map(p => {
    const row = toSupabaseProduct(p, { lang: 'uk' });
    delete row.id;  // Let Supabase auto-generate the ID
    return row;
  });

  // Insert UK products and capture their new IDs
  const ukProducts = await supaPost('products', ukDrafts,
    'resolution=ignore-duplicates,return=representation');
  console.log(`    Created UK products: ${ukProducts.length}`);

  // Build mapping: translation_id → uk product id
  const translationToUkId = {};
  for (const p of ukProducts) {
    translationToUkId[p.translation_id] = p.id;
  }

  // ── Step 6: Insert products_categories links ─────────────────────────────────
  console.log('\n[6] Inserting products_categories links...');

  // RU products → category 48
  const ruLinks = pcLinksRu.map(({ id, pid, cid }) => ({ id, pid, cid }));

  // UK products → category 183
  const ukLinks = ruProducts
    .map(p => {
      const ukId = translationToUkId[p.translationId ?? p.id];
      return ukId ? { pid: ukId, cid: CAT_UK } : null;
    })
    .filter(Boolean);

  const ruLinksInserted = await batchInsert('products_categories', ruLinks,
    'resolution=merge-duplicates,return=minimal');
  console.log(`    RU links (cid=${CAT_RU}): ${ruLinks.length}`);

  const ukLinksInserted = await batchInsert('products_categories', ukLinks,
    'resolution=ignore-duplicates,return=minimal');
  console.log(`    UK links (cid=${CAT_UK}): ${ukLinks.length}`);

  // ── Step 7: Insert photos ─────────────────────────────────────────────────────
  // products_photos columns: id, pid, translation_id, lang, img, title, priority
  console.log('\n[7] Inserting products_photos...');

  // Photos for RU products (keep original IDs and lang)
  const ruPhotoRows = ruPhotos.map(p => ({
    id:             p.id,
    pid:            p.pid,
    translation_id: p.translationId ?? 0,
    lang:           p.lang ?? 'ru',
    img:            p.img,
    title:          p.title ?? '',
    priority:       p.priority ?? 20,
  }));

  // Photos for UK products — same img but pointing to uk product IDs, lang='uk'
  const ukPhotoRows = ruPhotos.map(p => {
    const ruProduct = ruProducts.find(rp => rp.id === p.pid);
    if (!ruProduct) return null;
    const ukId = translationToUkId[ruProduct.translationId ?? ruProduct.id];
    if (!ukId) return null;
    return {
      pid:            ukId,
      translation_id: ruProduct.translationId ?? 0,
      lang:           'uk',
      img:            p.img,
      title:          p.title ?? '',
      priority:       p.priority ?? 20,
    };
  }).filter(Boolean);

  await batchInsert('products_photos', ruPhotoRows, 'resolution=merge-duplicates,return=minimal');
  console.log(`    RU photos: ${ruPhotoRows.length}`);

  await batchInsert('products_photos', ukPhotoRows, 'resolution=ignore-duplicates,return=minimal');
  console.log(`    UK photos: ${ukPhotoRows.length}`);

  // products_photos2 (secondary)
  if (ruPhotos2.length) {
    const ruPhoto2Rows = ruPhotos2.map(p => ({
      id:             p.id,
      pid:            p.pid,
      translation_id: p.translationId ?? 0,
      lang:           p.lang ?? 'ru',
      img:            p.img,
      title:          p.title ?? '',
      priority:       p.priority ?? 20,
    }));
    await batchInsert('products_photos2', ruPhoto2Rows, 'resolution=merge-duplicates,return=minimal');
    console.log(`    RU photos2: ${ruPhoto2Rows.length}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║           IMPORT COMPLETE                ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║  RU products inserted:   ${String(supaRuProducts.length).padEnd(15)}║`);
  console.log(`║  UK products created:    ${String(ukProducts.length).padEnd(15)}║`);
  console.log(`║  Category links (RU):    ${String(ruLinks.length).padEnd(15)}║`);
  console.log(`║  Category links (UK):    ${String(ukLinks.length).padEnd(15)}║`);
  console.log(`║  Photos imported:        ${String(ruPhotoRows.length + ukPhotoRows.length).padEnd(15)}║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log('║  NOTE: Product images are stored as      ║');
  console.log('║  filenames only (IMG_xxxxx.webp).        ║');
  console.log('║  Upload them to R2: products/ folder     ║');
  console.log('║  then update img field to full URL.      ║');
  console.log('╚══════════════════════════════════════════╝');
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
