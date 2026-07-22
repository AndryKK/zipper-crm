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

  const sortDir = searchParams.get("sort_dir") === "desc" ? false : true; // ascending param for .order()
  // Sorting the parent (inventory) rows by an embedded to-one resource's
  // column needs PostgREST's `order=<embed>(<column>).asc` syntax — passed
  // as a raw "column" name here since postgrest-js's `foreignTable` option
  // instead sorts rows *inside* a to-many embed (a different, unrelated
  // feature) and silently no-ops for a to-one relationship like this one.
  const SORTABLE: Record<string, string> = {
    title: "product(title)",
    warehouse: "warehouse(title)",
    initial_quantity: "initial_quantity",
    quantity: "quantity",
    reserved: "reserved",
    min_quantity: "min_quantity",
  };
  const sortKey = searchParams.get("sort_by") ?? "";
  const sortColumn = SORTABLE[sortKey];

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
    if (sortColumn) {
      query = query.order(sortColumn, { ascending: sortDir });
    }
    return query.order("id", { ascending: true });
  }

  /* Each inventory row is keyed by the ru side of a ru/uk pair (see
   * lib/inventory.ts) — the FK join above only ever returns that ru product.
   * Batch-fetch the uk sibling's title too so the UI can show the Ukrainian
   * name for what is, physically, one merged stock row.
   *
   * A handful of translation_id groups (leftover junk from an old import —
   * see feedback_bulk_insert_trigger_storm-era investigation) have MULTIPLE
   * uk-tagged rows sharing one translation_id, where only one is actually
   * translated and the others are stale duplicates whose title is still the
   * untranslated Russian text. Picking arbitrarily among them (previously:
   * whichever came back last from the query, unordered) could surface one
   * of those Russian-text duplicates as if it were "the Ukrainian name" —
   * exactly backwards. Prefer the candidate whose title actually differs
   * from the ru title (the real translation); only fall back to a
   * same-text duplicate if literally nothing else exists. */
  async function attachSiblingTitles(rows: any[]): Promise<any[]> {
    const ruRows = rows.filter((r) => r.product?.lang === "ru");
    const ruIds = ruRows.map((r) => r.product.id);
    if (ruIds.length === 0) return rows;
    const { data: siblings } = await supabaseServer
      .from("products")
      .select("id, title, translation_id")
      .eq("lang", "uk")
      .in("translation_id", ruIds);
    const ruTitleByRuId = new Map(ruRows.map((r) => [r.product.id, r.product.title]));
    const byTranslationId = new Map<number, { id: number; title: string; translation_id: number }>();
    for (const s of (siblings || []) as { id: number; title: string; translation_id: number }[]) {
      const existing = byTranslationId.get(s.translation_id);
      const isRealTranslation = s.title !== ruTitleByRuId.get(s.translation_id);
      if (!existing || (isRealTranslation && existing.title === ruTitleByRuId.get(s.translation_id))) {
        byTranslationId.set(s.translation_id, s);
      }
    }
    return rows.map((r) => ({ ...r, product_uk: r.product?.lang === "ru" ? byTranslationId.get(r.product.id) ?? null : null }));
  }

  /* The "Всього одиниць"/"Під мінімумом" summary cards normally come from
   * the daily warehouse_stats materialized view (fast, but always reflects
   * the WHOLE warehouse). When a search (`q`) narrows the table to a few
   * matches, showing that whole-warehouse total next to a 1-row result
   * looks like a bug — so recompute those two numbers over just the
   * filtered set here. Cheap: search results are always a small subset. */
  async function computeFilteredAggregate() {
    if (!productIds) return null;
    const matched: { quantity: number; min_quantity: number }[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      let q2 = supabaseServer.from("inventory").select("quantity, min_quantity");
      if (warehouseId) q2 = q2.eq("warehouse_id", Number(warehouseId));
      if (productId) q2 = q2.eq("product_id", Number(productId));
      q2 = q2.in("product_id", productIds!);
      const { data, error } = await q2.range(from, from + pageSize - 1);
      if (error || !data || data.length === 0) break;
      matched.push(...data);
      if (data.length < pageSize) break;
    }
    const totalQty = matched.reduce((s, r) => s + Number(r.quantity), 0);
    const lowStock = matched.filter((r) => Number(r.min_quantity) > 0 && Number(r.quantity) <= Number(r.min_quantity)).length;
    return { totalQty, lowStock, positions: matched.length };
  }

  /* Paginated mode, used by the /warehouses inventory tab — a warehouse can
   * hold thousands of products, too many to load and render in one table. */
  if (page) {
    const p = Math.max(1, Number(page));
    const from = (p - 1) * limit;
    const { data, error, count } = await buildQuery(true).range(from, from + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      rows: await attachSiblingTitles(data || []),
      total: count ?? 0,
      aggregate: await computeFilteredAggregate(),
    });
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
  const { product_id, warehouse_id, quantity, reserved, min_quantity } = body;

  if (!product_id || !warehouse_id) {
    return NextResponse.json({ error: "product_id та warehouse_id обов'язкові" }, { status: 400 });
  }

  // Whichever language's product id was entered, store under the ru/uk
  // pair's shared key so it lands on the same merged row — see lib/inventory.ts.
  const resolvedProductId = await resolveInventoryProductId(Number(product_id));
  const newQuantity = Number(quantity ?? 0);

  const { data, error } = await supabaseServer
    .from("inventory")
    .upsert(
      {
        product_id: resolvedProductId,
        warehouse_id: Number(warehouse_id),
        quantity: newQuantity,
        reserved: Number(reserved ?? 0),
        // initial_quantity is not a user-editable field — it's always
        // whatever quantity was manually recorded at (this stays the 100%
        // "fill" baseline until the next manual entry changes it again).
        initial_quantity: newQuantity,
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
  // mode "set" (default, "Ручне введення"): quantity is the new absolute
  // value. mode "restock" ("Поставка"): deltaQty is ADDED to the current
  // quantity (a delivery arriving). Both establish a fresh initial_quantity
  // baseline at the resulting value — see lib/inventory.ts.
  const { id, quantity, deltaQty, reserved, min_quantity, note, mode = "set" } = body;

  if (!id) return NextResponse.json({ error: "id обов'язковий" }, { status: 400 });

  const { data: before } = await supabaseServer
    .from("inventory")
    .select("product_id, warehouse_id, quantity, reserved, min_quantity")
    .eq("id", Number(id))
    .single();

  if (!before) return NextResponse.json({ error: "Запис не знайдено" }, { status: 404 });

  const newQuantity = mode === "restock"
    ? Number(before.quantity) + Number(deltaQty ?? 0)
    : Number(quantity ?? 0);

  const { data, error } = await supabaseServer
    .from("inventory")
    .update({
      quantity: newQuantity,
      // The lightweight "Поставка" flow only sends deltaQty — fall back to
      // the existing values instead of wiping reserved/min_quantity to 0.
      reserved: reserved !== undefined ? Number(reserved) : Number(before.reserved),
      // initial_quantity is not a user-editable field — every manual
      // quantity entry (set OR restock) resets the "fill" baseline to the
      // resulting value.
      initial_quantity: newQuantity,
      min_quantity: min_quantity !== undefined ? Number(min_quantity) : Number(before.min_quantity),
      updated_at: new Date().toISOString(),
    })
    .eq("id", Number(id))
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (Number(before.quantity) !== newQuantity) {
    await supabaseServer.from("inventory_history").insert({
      product_id: before.product_id,
      warehouse_id: before.warehouse_id,
      quantity_before: before.quantity,
      quantity_after: newQuantity,
      delta: newQuantity - Number(before.quantity),
      source: mode === "restock" ? "restock" : "manual",
      changed_by: session?.user?.name ?? null,
      note: note?.trim() || null,
    });
  }

  return NextResponse.json(data);
}
