/**
 * Direct fix for the 4 known broken img records.
 * - id=1 (uk): IMG_sample.webp not in R2 → set img=''
 * - id=10221 (uk): img ends with "/products/" → set img=''
 * - id=9599 (uk): Cyrillic URL-encoded → check decoded key; fix URL or set ''
 */
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8").split("\n")
    .filter(l => l.trim() && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")]; })
);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

const HOST   = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname;
const API    = env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = env.R2_BUCKET;
const R2_URL = env.NEXT_PUBLIC_R2_PUBLIC_URL;

function supaReq(method, path, body, prefer) {
  return new Promise((resolve, reject) => {
    const buf = body ? Buffer.from(JSON.stringify(body), "utf8") : null;
    const req = https.request({
      hostname: HOST, port: 443, path: `/rest/v1/${path}`, method,
      headers: {
        Authorization: `Bearer ${API}`, apikey: API, Accept: "application/json",
        ...(buf ? { "Content-Type": "application/json", "Content-Length": buf.length } : {}),
        ...(prefer ? { Prefer: prefer } : {}),
      },
    }, res => {
      let d=""; res.on("data",c=>d+=c);
      res.on("end",()=>{
        if (res.statusCode >= 200 && res.statusCode < 300)
          try { resolve(JSON.parse(d)); } catch { resolve(null); }
        else reject(new Error(`${method} → HTTP ${res.statusCode}: ${d.slice(0,300)}`));
      });
    });
    req.on("error", reject);
    if (buf) req.write(buf);
    req.end();
  });
}

async function r2Exists(key) {
  try { await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; }
  catch { return false; }
}

async function setImg(table, id, value) {
  await supaReq("PATCH", `${table}?id=eq.${id}`, { img: value }, "return=minimal");
  console.log(`  SET ${table} id=${id} img="${value.slice(0,50)}"`);
}

(async () => {
  console.log("=== Direct img fix ===\n");

  // 1. Products with empty-filename R2 URL (ends with /products/)
  const emptyFnProds = await supaReq("GET",
    `products?select=id,lang,img&img=like.${encodeURIComponent(R2_URL + "/products/")}&limit=50`
  );
  console.log(`Products with empty filename URL: ${(emptyFnProds||[]).length}`);
  for (const p of emptyFnProds || []) {
    await setImg("products", p.id, "");
  }

  // Same for products_photos
  const emptyFnPhotos = await supaReq("GET",
    `products_photos?select=id,pid,img&img=like.${encodeURIComponent(R2_URL + "/products/")}&limit=50`
  );
  console.log(`Photos with empty filename URL: ${(emptyFnPhotos||[]).length}`);
  for (const p of emptyFnPhotos || []) {
    await setImg("products_photos", p.id, "");
  }

  // 2. Products with IMG_sample.webp URL (not in R2)
  const sampleUrl = `${R2_URL}/products/IMG_sample.webp`;
  const sampleProds = await supaReq("GET",
    `products?select=id,lang,img&img=eq.${encodeURIComponent(sampleUrl)}&limit=20`
  );
  console.log(`\nProducts with IMG_sample.webp: ${(sampleProds||[]).length}`);
  for (const p of sampleProds || []) {
    await setImg("products", p.id, "");
  }

  // 3. Check URL-encoded Cyrillic filenames (id=9599, etc.)
  // The img URL contains % encoding for Cyrillic chars
  const encodedProds = await supaReq("GET",
    `products?select=id,lang,img&img=like.${encodeURIComponent(R2_URL + "/products/%25")}&limit=50`
  );
  // Also try: img contains %D0 or %D1 (start of Cyrillic UTF-8 encoded)
  const cyrillicProds = await supaReq("GET",
    `products?select=id,lang,img&img=like.${encodeURIComponent("%" + R2_URL.slice(5) + "/products/%25D")}&limit=50`
  );

  // Direct approach: fetch id=9599 and check
  const p9599 = await supaReq("GET", "products?select=id,lang,img&id=eq.9599&limit=1");
  console.log(`\nProduct id=9599: ${JSON.stringify(p9599)}`);
  if (p9599?.[0]?.img) {
    const imgUrl = p9599[0].img;
    const rawPath = new URL(imgUrl).pathname.slice(1);
    const decodedPath = decodeURIComponent(rawPath);
    const decodedFilename = decodedPath.split("/").pop();
    console.log(`  Raw key:     ${rawPath}`);
    console.log(`  Decoded key: ${decodedPath}`);
    const inR2Decoded = await r2Exists(decodedPath);
    const inR2Raw     = await r2Exists(rawPath);
    console.log(`  In R2 (decoded): ${inR2Decoded}`);
    console.log(`  In R2 (raw):     ${inR2Raw}`);
    if (!inR2Decoded && !inR2Raw) {
      await setImg("products", 9599, "");
    } else {
      // Fix URL to use decoded filename
      const correctUrl = `${R2_URL}/${decodedPath}`;
      if (correctUrl !== imgUrl) {
        await setImg("products", 9599, correctUrl);
      } else {
        console.log("  -> URL already correct");
      }
    }
  }

  // 4. Check if there are other broken imgs by querying for any remaining "non-IMG" patterns
  // that might have been missed (NULL after fix would cause NOT NULL error)
  console.log("\n--- Final spot check ---");
  const remaining = await supaReq("GET",
    "products?select=id,img&img=not.like.https*&img=not.is.null&img=not.eq.&limit=10"
  );
  console.log(`Products with non-http, non-empty img: ${(remaining||[]).length}`);
  for (const p of remaining || []) {
    console.log(`  id=${p.id} img="${p.img}"`);
  }

  const nullCount = await supaReq("GET", "products?select=id&img=is.null&limit=5");
  console.log(`\nProducts with NULL img: ${(nullCount||[]).length} (this violates constraint if any)`);

  console.log("\nDone.");
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
