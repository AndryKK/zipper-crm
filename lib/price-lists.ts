import { supabaseServer } from "@/lib/supabase";
import * as XLSX from "xlsx";

/**
 * Generates one XLSX price list per top-level category (per language) and
 * uploads each to the public "price-lists" Supabase Storage bucket, then
 * upserts a `docs` row (uri = "price-{lang}-{categoryId}") pointing at it.
 * The public PHP shops (price.php) read those rows to link to a static,
 * always-downloadable file.
 *
 * Replaces the old approach of generating the XLSX on the fly in
 * price_download.php on both PHP sites, using a ~2015 PHPExcel build that
 * relies on `$string{$index}` curly-brace offset syntax PHP 8 removed
 * entirely — every single download there fatally errored.
 */

const BUCKET = "price-lists";
const LANGS = ["uk", "ru"] as const;
const SITE_URL: Record<string, string> = {
  uk: "https://zipper-com-ua.fly.dev",
  ru: "https://zipper-in-ua.fly.dev",
};

export type PriceListLogEntry = {
  lang: string;
  category: string;
  products: number;
  url?: string;
  skipped?: boolean;
};

async function ensureBucket() {
  const { data: buckets, error } = await supabaseServer.storage.listBuckets();
  if (error) throw error;
  if (buckets.some((b) => b.name === BUCKET)) return;
  const { error: createErr } = await supabaseServer.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "10MB",
  });
  if (createErr) throw createErr;
}

// Collects every descendant category id (any depth) for a given root, by
// building a pid -> children map in memory and walking it — avoids needing
// a raw recursive SQL query over the REST API.
function collectDescendants(rootId: number, byParent: Map<number, number[]>) {
  const ids = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const child of byParent.get(current) ?? []) {
      ids.push(child);
      queue.push(child);
    }
  }
  return ids;
}

async function fetchAllProducts(lang: string, descendantIds: number[]) {
  // PostgREST caps a single request at 1000 rows by default — page through
  // in 1000-row batches until a page comes back short, otherwise the two
  // biggest categories here (several thousand products each) get silently
  // truncated.
  const products: any[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data: page, error } = await supabaseServer
      .from("products")
      .select("pcode, title, price, price_sale, label_action, uri, active, translation_id")
      .eq("lang", lang)
      .eq("active", 1)
      .in("pid", descendantIds)
      .order("priority", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    products.push(...page);
    if (page.length < PAGE) break;
  }
  return products;
}

export async function generatePriceLists(): Promise<PriceListLogEntry[]> {
  await ensureBucket();
  const log: PriceListLogEntry[] = [];

  for (const lang of LANGS) {
    const { data: allCats, error: catErr } = await supabaseServer
      .from("categories")
      .select("translation_id, pid, title, priority")
      .eq("lang", lang)
      .eq("visibility", 1)
      .order("priority", { ascending: true });
    if (catErr) throw catErr;

    const byParent = new Map<number, number[]>();
    for (const c of allCats!) {
      if (!byParent.has(c.pid)) byParent.set(c.pid, []);
      byParent.get(c.pid)!.push(c.translation_id);
    }
    const topLevel = allCats!.filter((c) => c.pid === 0);

    for (const cat of topLevel) {
      const descendantIds = collectDescendants(cat.translation_id, byParent);
      const products = await fetchAllProducts(lang, descendantIds);

      if (!products.length) {
        log.push({ lang, category: cat.title, products: 0, skipped: true });
        continue;
      }

      const siteUrl = SITE_URL[lang] ?? SITE_URL.uk;
      const rows = products.map((p) => ({
        "Код товару": p.pcode ?? "",
        "Назва": p.title,
        "Ціна, грн": p.label_action === 1 && p.price_sale ? p.price_sale : p.price,
        "Стара ціна, грн": p.label_action === 1 && p.price_sale ? p.price : "",
        "Посилання": `${siteUrl}/product/${p.uri}`,
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 14 }, { wch: 50 }, { wch: 12 }, { wch: 14 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, ws, "Прайс");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      const objectPath = `price-${lang}-${cat.translation_id}.xlsx`;
      const { error: uploadErr } = await supabaseServer.storage
        .from(BUCKET)
        .upload(objectPath, buf, {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        });
      if (uploadErr) throw uploadErr;

      const { data: pub } = supabaseServer.storage.from(BUCKET).getPublicUrl(objectPath);
      const fileUrl = pub.publicUrl;

      // uri is the lookup key the PHP sites use (see price.php) — distinct
      // from other `docs` rows (e.g. the ISO certificate) by the "price-"
      // prefix, since translation_id alone would collide with a category id
      // that happens to equal an unrelated doc's translation_id.
      const uri = `price-${lang}-${cat.translation_id}`;
      const { data: existing } = await supabaseServer
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
        const { error: updErr } = await supabaseServer.from("docs").update(row).eq("id", existing.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabaseServer.from("docs").insert(row);
        if (insErr) throw insErr;
      }

      log.push({ lang, category: cat.title, products: products.length, url: fileUrl });
    }
  }

  return log;
}

export async function listPriceLists() {
  const { data, error } = await supabaseServer
    .from("docs")
    .select("id, title, file, lang, translation_id, date")
    .like("uri", "price-%")
    .order("lang", { ascending: true })
    .order("priority", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
