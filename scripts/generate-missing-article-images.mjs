/**
 * Finds articles/news rows whose `img` is missing or dead (null, a bare
 * filename never uploaded, or a URL that 404s), generates a hero image with
 * OpenAI's image API from that article's own title+content, uploads it to
 * R2, and writes the new URL back onto every row sharing that translation_id
 * (uk/ru siblings always carry the same img — verified against live data).
 *
 * There's no separate "alt" column on either table (confirmed against the
 * live schema and both PHP site templates) — alt text in the storefront is
 * always the article's own title/heading, so that's also what doubles as
 * the subject line for the generated image's prompt, with descr/text
 * (stripped of HTML) as the supporting context.
 *
 * A translation_id where at least one sibling row already has a working
 * image is "self-healed" instead of re-generated: the working URL is just
 * copied onto the broken sibling(s), no OpenAI call needed.
 *
 * Usage:
 *   node scripts/generate-missing-article-images.mjs [articles|news] [--dry-run]
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(__dirname, "..");

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const TABLE = (process.argv[2] && !process.argv[2].startsWith("--")) ? process.argv[2] : "articles";
const DRY_RUN = process.argv.includes("--dry-run");
if (!["articles", "news"].includes(TABLE)) {
  console.error(`Unknown table "${TABLE}" — expected "articles" or "news".`);
  process.exit(1);
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const R2_PUBLIC_URL = env.NEXT_PUBLIC_R2_PUBLIC_URL;
const R2_BUCKET = env.R2_BUCKET;
const OPENAI_API_KEY = env.OPENAI_API_KEY;
const R2_FOLDER = TABLE; // articles -> "articles/", news -> "news/" — matches the live R2 layout.

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set in .env — can't generate images.");
  process.exit(1);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

// ── Supabase REST helpers (fetch-based, same approach as the translate routes) ──

async function supaSelect(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function supaPatch(table, filter, update) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(update),
  });
  if (!res.ok) throw new Error(`PATCH ${table} -> HTTP ${res.status}: ${await res.text()}`);
}

async function isReachable(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

function stripHtml(html) {
  return (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── OpenAI: content -> prompt -> image ───────────────────────────────────────

async function buildImagePrompt(alt, content) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You write short image-generation prompts for hero photos on a sewing/haberdashery e-commerce blog " +
            "(zippers, sliders, fasteners, fabric trims and similar). Given an article's title and content, " +
            "describe ONE concrete, visually rich scene that illustrates it — editorial product photography or " +
            "elegant flat-lay style, natural light, no on-image text, letters, numbers, logos or watermarks. " +
            "Answer with the prompt only, in English, 1-3 sentences, no preamble.",
        },
        { role: "user", content: `Title: ${alt}\n\nContent: ${content.slice(0, 1500)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`chat/completions -> HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const prompt = data.choices?.[0]?.message?.content?.trim();
  if (!prompt) throw new Error("Empty prompt from chat/completions");
  return prompt;
}

async function generateImage(prompt) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-image-1-mini", prompt, n: 1, size: "1536x1024" }),
  });
  if (!res.ok) throw new Error(`images/generations -> HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("No b64_json in images/generations response");
  return Buffer.from(b64, "base64");
}

async function uploadToR2(key, buffer) {
  await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: "image/png" }));
  return `${R2_PUBLIC_URL}/${key}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`=== generate-missing-article-images (table: ${TABLE}${DRY_RUN ? ", DRY RUN" : ""}) ===`);

  const rows = await supaSelect(
    `${TABLE}?select=id,translation_id,lang,uri,title,heading,descr,text,img&order=translation_id.asc`
  );
  console.log(`Fetched ${rows.length} rows.`);

  const byTid = new Map();
  for (const r of rows) {
    const list = byTid.get(r.translation_id) ?? [];
    list.push(r);
    byTid.set(r.translation_id, list);
  }
  console.log(`${byTid.size} distinct articles (translation_id groups).`);

  let healed = 0;
  let generated = 0;
  let failed = 0;
  let alreadyOk = 0;

  for (const [tid, group] of byTid) {
    const reachable = await Promise.all(group.map((r) => isReachable(r.img)));
    const workingRow = group.find((_, i) => reachable[i]);

    if (workingRow) {
      const broken = group.filter((_, i) => !reachable[i]);
      if (broken.length === 0) {
        alreadyOk++;
        continue;
      }
      console.log(`[tid ${tid}] self-heal: copying working image onto ${broken.length} sibling row(s).`);
      if (!DRY_RUN) {
        for (const b of broken) await supaPatch(TABLE, `id=eq.${b.id}`, { img: workingRow.img });
      }
      healed++;
      continue;
    }

    // Nobody in this group has a working image — generate one.
    const source =
      group.find((r) => stripHtml(r.text).length > 0) ??
      group.find((r) => stripHtml(r.descr).length > 0) ??
      group[0];
    const alt = source.heading || source.title || `article ${tid}`;
    const content = stripHtml(source.text) || stripHtml(source.descr) || alt;

    console.log(`[tid ${tid}] no working image — generating for "${alt}"`);
    try {
      const prompt = await buildImagePrompt(alt, content);
      console.log(`  prompt: ${prompt}`);
      if (DRY_RUN) {
        generated++;
        continue;
      }
      const buffer = await generateImage(prompt);
      const key = `${R2_FOLDER}/ai-${tid}-${Date.now()}.png`;
      const url = await uploadToR2(key, buffer);
      for (const r of group) await supaPatch(TABLE, `id=eq.${r.id}`, { img: url });
      console.log(`  uploaded: ${url}`);
      generated++;
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
      failed++;
    }
  }

  console.log("\n=== DONE ===");
  console.log(`Already had a working image: ${alreadyOk}`);
  console.log(`Self-healed from a sibling row: ${healed}`);
  console.log(`Generated with AI: ${generated}`);
  console.log(`Failed: ${failed}`);
})().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
