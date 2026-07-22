import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { resolveInventoryProductId } from "@/lib/inventory";

const SELECT = `
  *,
  product:products!inventory_product_id_fkey(id, title, pcode, lang),
  warehouse:warehouses!inventory_warehouse_id_fkey(id, title)
`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouse_id");
  // Resolve to the ru/uk pair's shared inventory key — see lib/inventory.ts.
  const productId = searchParams.get("product_id")
    ? await resolveInventoryProductId(Number(searchParams.get("product_id")))
    : null;
  const q = searchParams.get("q");
  const page = searchParams.get("page");
  const limit = Number(searchParams.get("limit") ?? 50);

  let productIds: number[] | null = null;
  if (q) {
    const { data: matches, error } = await supabaseServer
      .from("products")
      .select("id, translation_id")
      .or(`title.ilike.%${q}%,pcode.ilike.%${q}%`)
      .limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // `inventory` is keyed by translation_id (the ru/uk pair's shared id —
    // see lib/inventory.ts), so a match on either language's title/pcode
    // must resolve to that shared key, or a uk-only title search would find
    // 0 rows even though the merged stock row exists under the ru id.
    productIds = Array.from(new Set((matches || []).map((p: any) => p.translation_id ?? p.id)));
    if (productIds.length === 0) return NextResponse.json(page ? { rows: [], total: 0 } : []);
  }

  function buildQuery(withCount: boolean) {
    let query = supabaseServer.from("inventory").select(SELECT, withCount ? { count: "exact" } : undefined);
    if (warehouseId) query = query.eq("warehouse_id", Number(warehouseId));
    if (productId) query = query.eq("product_id", Number(productId));
    if (productIds) query = query.in("product_id", productIds);
    return query.order("id", { ascending: true });
  }

  /* Each inventory row is keyed by the ru side of a ru/uk pair (see
   * lib/inventory.ts) — the FK join above only ever returns that ru product.
   * Batch-fetch the uk sibling's title too so the UI can show both names for
   * what is, physically, one merged stock row. */
  async function attachSiblingTitles(rows: any[]): Promise<any[]> {
    const ruIds = rows.filter((r) => r.product?.lang === "ru").map((r) => r.product.id);
    if (ruIds.length === 0) return rows;
    const { data: siblings } = await supabaseServer
      .from("products")
      .select("id, title, translation_id")
      .eq("lang", "uk")
      .in("translation_id", ruIds);
    const byTranslationId = new Map((siblings || []).map((s: any) => [s.translation_id, s]));
    return rows.map((r) => ({ ...r, product_uk: r.product?.lang === "ru" ? byTranslationId.get(r.product.id) ?? null : null }));
  }

  /* Paginated mode, used by the /warehouses inventory tab — a warehouse can
   * hold thousands of products, too many to load and render in one table. */
  if (page) {
    const p = Math.max(1, Number(page));
    const from = (p - 1) * limit;
    const { data, error, count } = await buildQuery(true).range(from, from + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: await attachSiblingTitles(data || []), total: count ?? 0 });
  }

  /* Legacy mode (no `page` param): return the full matching set. PostgREST
   * caps a single request at its configured max-rows, so page past that. */
  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(false).range(from, from + pageSize - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return NextResponse.json(await attachSiblingTitles(rows));
}

export async function POST(req: Request) {
  const body = await req.json();
  const { product_id, warehouse_id, quantity, reserved, initial_quantity, min_quantity } = body;

  if (!product_id || !warehouse_id) {
    return NextResponse.json({ error: "product_id та warehouse_id обов'язкові" }, { status: 400 });
  }

  // Whichever language's product id was entered, store under the ru/uk
  // pair's shared key so it lands on the same merged row — see lib/inventory.ts.
  const resolvedProductId = await resolveInventoryProductId(Number(product_id));

  const { data, error } = await supabaseServer
    .from("inventory")
    .upsert(
      {
        product_id: resolvedProductId,
        warehouse_id: Number(warehouse_id),
        quantity: Number(quantity ?? 0),
        reserved: Number(reserved ?? 0),
        initial_quantity: Number(initial_quantity ?? 0),
        min_quantity: Number(min_quantity ?? 0),
      },
      { onConflict: "product_id,warehouse_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: Request) {
  const session = await auth();
  const body = await req.json();
  const { id, quantity, reserved, initial_quantity, min_quantity, note } = body;

  if (!id) return NextResponse.json({ error: "id обов'язковий" }, { status: 400 });

  const { data: before } = await supabaseServer
    .from("inventory")
    .select("product_id, warehouse_id, quantity")
    .eq("id", Number(id))
    .single();

  const newQuantity = Number(quantity ?? 0);

  const { data, error } = await supabaseServer
    .from("inventory")
    .update({
      quantity: newQuantity,
      reserved: Number(reserved ?? 0),
      initial_quantity: Number(initial_quantity ?? 0),
      min_quantity: Number(min_quantity ?? 0),
      updated_at: new Date().toISOString(),
    })
    .eq("id", Number(id))
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (before && Number(before.quantity) !== newQuantity) {
    await supabaseServer.from("inventory_history").insert({
      product_id: before.product_id,
      warehouse_id: before.warehouse_id,
      quantity_before: before.quantity,
      quantity_after: newQuantity,
      delta: newQuantity - Number(before.quantity),
      source: "manual",
      changed_by: session?.user?.name ?? null,
      note: note?.trim() || null,
    });
  }

  return NextResponse.json(data);
}
