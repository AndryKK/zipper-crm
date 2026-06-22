/**
 * Checks whether specific files actually exist in R2 bucket.
 */
import { S3Client, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env"), "utf8").split("\n")
    .filter(l => l.trim() && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; })
);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const BUCKET = env.R2_BUCKET;
const API    = env.SUPABASE_SERVICE_ROLE_KEY;
const HOST   = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;

// Get a sample of img URLs from Supabase for new products
function supaGet(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: HOST, port: 443, path: `/rest/v1/${path}`,
      headers: { Authorization: `Bearer ${API}`, apikey: API, Accept: "application/json" },
    }, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => resolve(JSON.parse(d)));
    }).on("error", reject);
  });
}

async function r2Exists(key) {
  try { await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; }
  catch (e) { return false; }
}

// List objects in products/ prefix
async function listR2(prefix, maxKeys = 5) {
  const res = await r2.send(new ListObjectsV2Command({
    Bucket: BUCKET, Prefix: prefix, MaxKeys: maxKeys,
  }));
  return (res.Contents ?? []).map(o => o.Key);
}

(async () => {
  console.log("=== R2 File Check ===\n");

  // 1. List some objects in R2 products/ folder
  console.log("Objects in R2 products/ prefix (first 10):");
  const listed = await listR2("products/", 10);
  listed.forEach(k => console.log("  " + k));
  console.log(`  (listed ${listed.length})\n`);

  // 2. Get some img URLs from Supabase for new products
  const rows = await supaGet("products?select=id,img&img=like.https*&id=lt.8723&limit=20");
  console.log(`Got ${rows.length} new products with R2 URLs from Supabase\n`);

  // 3. For each, extract the R2 key and check existence
  console.log("Checking whether those R2 keys actually exist in the bucket:");
  let ok = 0, missing = 0;
  for (const r of rows.slice(0, 10)) {
    // URL: https://pub-xxx.r2.dev/products/IMG_xxx.webp → key: products/IMG_xxx.webp
    const key = new URL(r.img).pathname.slice(1);  // remove leading /
    const exists = await r2Exists(key);
    const status = exists ? "EXISTS" : "MISSING";
    console.log(`  [${status}] id=${r.id} key=${key}`);
    if (exists) ok++; else missing++;
  }
  console.log(`\n  R2 EXISTS: ${ok}, MISSING: ${missing}`);

  // 4. Also check a known-good straz image
  console.log("\nChecking straz (category 48) product images:");
  const straz = await supaGet("products?select=id,img&id=in.(748,749,750)&limit=5");
  for (const r of straz) {
    if (!r.img || !r.img.startsWith('http')) { console.log(`  id=${r.id} no URL`); continue; }
    const key = new URL(r.img).pathname.slice(1);
    const exists = await r2Exists(key);
    console.log(`  [${exists ? 'EXISTS' : 'MISSING'}] id=${r.id} key=${key}`);
  }
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
