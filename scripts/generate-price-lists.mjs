// node scripts/generate-price-lists.mjs
//
// Generates one XLSX price list per top-level category (per language),
// uploads each to the Supabase Storage "price-lists" bucket, and records
// the public URL in the `docs` table so the public PHP shops can link to a
// static, always-downloadable file instead of generating one on the fly.
//
// The old approach (ajax-controllers/../price_download.php on both PHP
// sites) generated the XLSX on every click using the PHPExcel library from
// ~2015 — that library uses `$string{$index}` curly-brace offset syntax
// PHP 8 removed entirely, so every single download has been a fatal error.
// Re-run this script (or trigger app/api/price-lists/regenerate/route.ts
// from the CRM) any time prices/products change enough to want a refresh.

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

const envRaw = readFileSync(join(ROOT, ".env"), "utf8");
const env = Object.fromEntries(
  envRaw.split("\n")
    .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, "")];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  // Node 20 here has no native WebSocket; we don't use realtime features at
  // all, so just satisfy supabase-js's constructor with a no-op transport
  // (same workaround already used in scripts/migrate-to-r2.mjs).
  realtime: { transport: class { constructor() {} } },
});

const BUCKET = "price-lists";
const LANGS = ["uk", "ru"];

async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (buckets.some((b) => b.name === BUCKET)) return;
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "10MB",
  });
  if (createErr) throw createErr;
  console.log(`Created public bucket "${BUCKET}"`);
}

// Collects every descendant category id (any depth) for a given root, by
// building a pid -> children map in memory and walking it — avoids needing
// a raw recursive SQL query over the REST API.
function collectDescendants(rootId, byParent) {
  const ids = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift();
    for (const child of byParent.get(current) ?? []) {
      ids.push(child);
      queue.push(child);
    }
  }
  return ids;
}

async function generateForLang(lang) {
  const { data: allCats, error: catErr } = await supabase
    .from("categories")
    .select("translation_id, pid, title, priority")
    .eq("lang", lang)
    .eq("visibility", 1)
    .order("priority", { ascending: true });
  if (catErr) throw catErr;

  const byParent = new Map();
  for (const c of allCats) {
    if (!byParent.has(c.pid)) byParent.set(c.pid, []);
    byParent.get(c.pid).push(c.translation_id);
  }
  const titleById = new Map(allCats.map((c) => [c.translation_id, c.title]));
  const topLevel = allCats.filter((c) => c.pid === 0);

  for (const cat of topLevel) {
    const descendantIds = collectDescendants(cat.translation_id, byParent);

    // PostgREST caps a single request at 1000 rows by default — the two
    // biggest categories here have several thousand products each, so this
    // silently truncated them without .range() pagination. Page through in
    // 1000-row batches until a page comes back short.
    const products = [];
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data: page, error: prodErr } = await supabase
        .from("products")
        .select("pcode, title, price, price_sale, label_action, uri, active, translation_id")
        .eq("lang", lang)
        .eq("active", 1)
        .in("pid", descendantIds)
        .order("priority", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (prodErr) throw prodErr;
      products.push(...page);
      if (page.length < PAGE) break;
    }

    if (!products.length) {
      console.log(`[${lang}] "${cat.title}" — no products, skipping`);
      continue;
    }

    const rows = products.map((p) => ({
      "Код товару": p.pcode ?? "",
      "Назва": p.title,
      "Ціна, грн": p.label_action === 1 && p.price_sale ? p.price_sale : p.price,
      "Стара ціна, грн": p.label_action === 1 && p.price_sale ? p.price : "",
      "Посилання": `https://zipper-com-ua.fly.dev/${lang === "uk" ? "" : lang + "/"}product/${p.uri}`,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 14 }, { wch: 50 }, { wch: 12 }, { wch: 14 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ws, "Прайс");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const objectPath = `price-${lang}-${cat.translation_id}.xlsx`;
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, buf, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      });
    if (uploadErr) throw uploadErr;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    const fileUrl = pub.publicUrl;

    // uri is the lookup key the PHP sites use (see price.php) — distinct
    // from other `docs` rows (e.g. the ISO certificate) by the "price-"
    // prefix, since translation_id alone would collide with a category id
    // that happens to equal an unrelated doc's translation_id.
    const uri = `price-${lang}-${cat.translation_id}`;
    const { data: existing } = await supabase
      .from("docs")
      .select("id")
      .eq("uri", uri)
      .maybeSingle();

    const row = {
      title: `${cat.title} — Прайс`,
      file: fileUrl,
      lang,
      priority: cat.priority ?? 0,
      translation_id: cat.translation_id,
      uri,
      date: new Date().toISOString(),
    };

    if (existing) {
      const { error: updErr } = await supabase.from("docs").update(row).eq("id", existing.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await supabase.from("docs").insert(row);
      if (insErr) throw insErr;
    }

    console.log(`[${lang}] "${cat.title}" — ${products.length} products -> ${fileUrl}`);
  }
}

await ensureBucket();
for (const lang of LANGS) {
  await generateForLang(lang);
}
console.log("Done.");
