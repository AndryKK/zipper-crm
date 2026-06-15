// Fetches actual column names from Supabase for tables that failed import
const https = require('https');
const fs = require('fs');
const path = require('path');

const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n').forEach(l => {
  const m = l.match(/^(\w+)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '').trim();
});

const KEY = env.SUPABASE_SECRET_KEY;
const HOST = 'ncjcqfqcmsjsqhxjkqxh.supabase.co';

function getTableCols(table) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: HOST, port: 443,
      path: `/rest/v1/${table}?limit=0`,
      headers: { 'Authorization': `Bearer ${KEY}`, 'apikey': KEY, 'Accept': 'application/json' },
    }, (res) => {
      // Check the response headers for column info
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          // If there's data, get keys from first row
          try {
            const rows = JSON.parse(data);
            if (rows.length > 0) resolve(Object.keys(rows[0]));
            else resolve([]); // empty table, no column info from data
          } catch { resolve([]); }
        } else {
          resolve(null); // table doesn't exist
        }
      });
    }).on('error', reject);
  });
}

// Get OpenAPI spec to extract all table column definitions
function getOpenApiSpec() {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: HOST, port: 443,
      path: '/rest/v1/',
      headers: { 'Authorization': `Bearer ${KEY}`, 'apikey': KEY },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching Supabase schema...\n');
  const spec = await getOpenApiSpec();
  const defs = spec.definitions || {};

  const FAILING_TABLES = [
    'currency', 'adm_users', 'socials', 'core', 'measures', 'measures_real',
    'users', 'users_categories', 'all_filters', 'all_filters_filters', 'slider',
    'categories', 'products', 'products_photos', 'all_filters_items',
    'articles', 'news', 'services', 'managers', 'orders',
  ];

  for (const table of FAILING_TABLES) {
    const def = defs[table];
    if (!def) {
      console.log(`${table}: NOT FOUND in schema`);
      continue;
    }
    const cols = Object.keys(def.properties || {});
    console.log(`${table}: [${cols.join(', ')}]`);
  }
}

main().catch(console.error);
