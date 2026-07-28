import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const lang = searchParams.get("lang") ?? "uk";
  const q = searchParams.get("q") ?? "";
  const ids = searchParams.get("ids");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "50");

  // Direct id lookup (e.g. resolving a product referenced by an order/return)
  // must NOT filter by lang — orders_item/orders_returns store the exact
  // per-language row id, which may not be the "uk" row (see invoice route
  // for the same fix).
  if (ids) {
    const idList = ids.split(",").map(Number).filter(Number.isFinite);
    const { data: items } = idList.length
      ? await supabaseServer.from("products").select("id, title, pcode").in("id", idList)
      : { data: [] };
    return NextResponse.json(items ?? []);
  }

  let query = supabaseServer
    .from("products")
    .select("*, labelAction:label_action, translationId:translation_id, seoTitle:seo_title, seoKey:seo_key, seoDescr:seo_descr", { count: "exact" })
    .eq("lang", lang);

  if (q) {
    query = query.or(`title.ilike.%${q}%,pcode.ilike.%${q}%,uri.ilike.%${q}%`);
  }

  const { data: items, count } = await query
    .order("priority", { ascending: true })
    .order("id", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  return NextResponse.json({ items: items || [], total: count ?? 0, page, limit });
}

// Артикул (pcode) is always auto-generated, never typed by hand: the
// number is the highest existing numeric part + 1 (checked against the
// most recently created products — that counter has always tracked
// closely with id, e.g. id 10321 -> pcode "bs10280", so the last 200 rows
// are enough without scanning the whole products table for one column).
// The letter prefix is inherited from the "Скопіювати з" source product
// (if any), or otherwise a random single English letter, since nothing
// about a from-scratch product implies which letter it should get.
async function generatePcode(copyFromId?: number): Promise<string> {
  const { data: recent } = await supabaseServer
    .from("products")
    .select("pcode")
    .order("id", { ascending: false })
    .limit(200);

  let maxNum = 0;
  for (const row of recent ?? []) {
    const n = parseInt(String((row as any).pcode ?? "").replace(/^\D+/, ""), 10);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }

  let letter = "";
  if (copyFromId) {
    const { data: src } = await supabaseServer
      .from("products")
      .select("pcode")
      .eq("id", copyFromId)
      .single();
    letter = String((src as any)?.pcode ?? "").match(/^\D*/)?.[0] ?? "";
  }
  if (!letter) {
    letter = String.fromCharCode(97 + Math.floor(Math.random() * 26));
  }

  return `${letter}${maxNum + 1}`;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { categoryIds, filterIds: _filterIds, copyFromId, pcode: _clientPcode, ...data } = body;

  const { data: maxTransRow } = await supabaseServer
    .from("products")
    .select("translation_id")
    .order("translation_id", { ascending: false })
    .limit(1)
    .single();
  const translationId = ((maxTransRow as any)?.translation_id ?? 0) + 1;

  const pcode = await generatePcode(copyFromId);

  const { data: langs } = await supabaseServer.from("langs").select("*").eq("active", 1);
  const activeLangs = langs || [];

  const products = await Promise.all(
    activeLangs.map(async (l: any) => {
      const { data: p } = await supabaseServer.from("products").insert({
        ...data,
        pcode,
        lang: l.code,
        translation_id: translationId,
        title: l.code === data.lang ? data.title : `[${l.code}] ${data.title}`,
      }).select("*").single();
      return p;
    })
  );

  const mainProduct = products.find((p: any) => p?.lang === (data.lang ?? "uk")) ?? products[0];

  if (categoryIds?.length && mainProduct) {
    await supabaseServer.from("products_categories").insert(
      categoryIds.map((cid: number) => ({ pid: (mainProduct as any).id, cid }))
    );
  }

  return NextResponse.json(mainProduct, { status: 201 });
}
