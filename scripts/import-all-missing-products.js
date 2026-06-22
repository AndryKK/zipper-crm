/**
 * Imports ALL products missing from Supabase.
 *
 * Context:
 *  - Supabase migration only included products with IDs >= 8723
 *  - MySQL dump has 9707 rows (IDs 110–10317), both RU and UK
 *  - Products with IDs < 8723 (except straz already imported) are missing
 *  - Both RU and UK versions have their own IDs in the dump
 *
 * What this script does:
 *  1. Parses ALL products from the dump where id < 8723 (excl. already-imported straz)
 *  2. Inserts them into Supabase with original MySQL IDs
 *  3. Inserts products_categories links from the dump
 *  4. Inserts products_photos from the dump
 *
 * Run: node scripts/import-all-missing-products.js
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── Config ────────────────────────────────────────────────────────────────
const DUMP_FILE   = path.join(__dirname, 'dump-extracted', 'mysql_mozar24_zipper.2026-06-01_1706.sql');
const ENV_FILE    = path.join(__dirname, '..', '.env');
const BATCH_SIZE  = 100;
const SUPABASE_MIN_ID = 8723;

// Straz products we already imported — skip them
const STRAZ_IMPORTED = new Set([
  748,749,750,751,752,753,754,755,756,757,758,
  759,760,761,762,763,764,765,766,767,768,769,
  770,771,772,773,774,775,776,2657,2658,
]);

// MySQL → Supabase column mapping for products
const COL_MAP = {
  id:           'id',
  translationId:'translation_id',
  lang:         'lang',
  pid:          'pid',
  filterId:     'filter_id',
  pcode:        'pcode',
  uri:          'uri',
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

function supaPost(table, rows, prefer = 'resolution=merge-duplicates,return=minimal') {
  return new Promise((resolve, reject) => {
    if (!rows.length) return resolve([]);
    const buf = Buffer.from(JSON.stringify(rows), 'utf8');
    const req = https.request({
      hostname: HOST, port: 443,
      path:     `/rest/v1/${table}`,
      method:   'POST',
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
          reject(new Error(`POST /${table} → HTTP ${res.statusCode}: ${d.slice(0, 600)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

async function batchInsert(table, rows, prefer) {
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await supaPost(table, batch, prefer);
    done += batch.length;
    process.stdout.write(`\r    ${done}/${rows.length} rows...`);
  }
  process.stdout.write('\n');
  return done;
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

function getCols(content, tableName) {
  const re = new RegExp(`CREATE TABLE \`${tableName}\` \\(([\\s\\S]*?)\\) ENGINE`);
  const m = content.match(re);
  const cols = [];
  if (m) {
    for (const line of m[1].split('\n')) {
      const lm = line.trim().match(/^`(\S+?)`/);
      if (lm) cols.push(lm[1]);
    }
  }
  return cols;
}

function parseTable(content, tableName) {
  const section = extractSection(content, tableName);
  const valMatch = section.match(/(?:REPLACE|INSERT) INTO `\S+` VALUES\s*([\s\S]+?);?\s*$/);
  if (!valMatch) return [];
  const cols = getCols(content, tableName);
  const rawRows = splitRows(valMatch[1]);
  return rawRows.map(raw => {
    const vals = parseValues(raw).map(toJs);
    const obj = {};
    cols.forEach((col, i) => { obj[col] = vals[i] !== undefined ? vals[i] : null; });
    return obj;
  });
}

// ─── Convert MySQL product → Supabase product ─────────────────────────────────
function toSupaProduct(row) {
  const out = {};
  for (const [mysql, supa] of Object.entries(COL_MAP)) {
    if (row[mysql] !== undefined) out[supa] = row[mysql];
  }
  return out;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const env = readEnv();
  API_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
  HOST    = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;
  if (!API_KEY || !HOST) { console.error('Missing env vars'); process.exit(1); }

  console.log(`Host: ${HOST}`);
  console.log(`Dump: ${DUMP_FILE}`);
  console.log(`Reading dump file (23 MB)...`);
  const content = fs.readFileSync(DUMP_FILE, 'utf8');
  console.log('Done.\n');

  // ── Step 1: Parse products ──────────────────────────────────────────────────
  console.log('[1/4] Parsing products table from dump...');
  const allProducts = parseTable(content, 'products');
  console.log(`    Total in dump:  ${allProducts.length}`);

  const missingProducts = allProducts.filter(p =>
    typeof p.id === 'number' &&
    p.id < SUPABASE_MIN_ID &&
    !STRAZ_IMPORTED.has(p.id)
  );
  console.log(`    Missing (to import): ${missingProducts.length}`);

  const ruCount = missingProducts.filter(p => p.lang === 'ru').length;
  const ukCount = missingProducts.filter(p => p.lang === 'uk').length;
  console.log(`    RU: ${ruCount}  |  UK: ${ukCount}\n`);

  if (!missingProducts.length) {
    console.log('Nothing to import. Exiting.');
    return;
  }

  const missingIds = new Set(missingProducts.map(p => p.id));

  // ── Step 2: Insert products ─────────────────────────────────────────────────
  console.log('[2/4] Inserting products into Supabase...');
  const supaProducts = missingProducts.map(toSupaProduct);

  // Insert in batches — use merge-duplicates to be safe
  await batchInsert('products', supaProducts, 'resolution=merge-duplicates,return=minimal');
  console.log(`    ✓ ${supaProducts.length} products inserted/updated\n`);

  // ── Step 3: products_categories ─────────────────────────────────────────────
  console.log('[3/4] Parsing & inserting products_categories...');
  const allPC = parseTable(content, 'products_categories');
  console.log(`    Total PC rows in dump: ${allPC.length}`);

  const newPC = allPC
    .filter(r => missingIds.has(r.pid))
    .map(r => ({ id: r.id, pid: r.pid, cid: r.cid }));
  console.log(`    PC rows for new products: ${newPC.length}`);

  await batchInsert('products_categories', newPC, 'resolution=merge-duplicates,return=minimal');
  console.log(`    ✓ ${newPC.length} category links inserted\n`);

  // ── Step 4: products_photos ─────────────────────────────────────────────────
  console.log('[4/4] Parsing & inserting products_photos...');
  const allPhotos = parseTable(content, 'products_photos');
  console.log(`    Total photos in dump: ${allPhotos.length}`);

  const newPhotos = allPhotos
    .filter(p => missingIds.has(p.pid))
    .map(p => ({
      id:             p.id,
      pid:            p.pid,
      translation_id: p.translationId ?? 0,
      lang:           p.lang ?? 'ru',
      img:            p.img ?? '',
      title:          p.title ?? '',
      priority:       p.priority ?? 20,
    }));
  console.log(`    Photos for new products: ${newPhotos.length}`);

  await batchInsert('products_photos', newPhotos, 'resolution=merge-duplicates,return=minimal');
  console.log(`    ✓ ${newPhotos.length} photos inserted\n`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log('  IMPORT COMPLETE');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Products inserted:   ${supaProducts.length}`);
  console.log(`    RU: ${ruCount}  UK: ${ukCount}`);
  console.log(`  Category links:     ${newPC.length}`);
  console.log(`  Photos inserted:    ${newPhotos.length}`);
  console.log('═══════════════════════════════════════════════');
  console.log('\nNext step: upload product images to R2');
  console.log('  node scripts/upload-all-missing-images.mjs');
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
