import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

const SELECT = `
  *,
  product:products!inventory_product_id_fkey(id, title, pcode, lang),
  warehouse:warehouses!inventory_warehouse_id_fkey(id, title)
`;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouse_id");
  const productId = searchParams.get("product_id");
  const q = searchParams.get("q");
  const page = searchParams.get("page");
  const limit = Number(searchParams.get("limit") ?? 50);

  let productIds: number[] | null = null;
  if (q) {
    const { data: matches, error } = await supabaseServer
      .from("products")
      .select("id")
      .or(`title.ilike.%${q}%,pcode.ilike.%${q}%`)
      .limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    productIds = (matches || []).map((p: any) => p.id);
    if (productIds.length === 0) return NextResponse.json(page ? { rows: [], total: 0 } : []);
  }

  function buildQuery(withCount: boolean) {
    let query = supabaseServer.from("inventory").select(SELECT, withCount ? { count: "exact" } : undefined);
    if (warehouseId) query = query.eq("warehouse_id", Number(warehouseId));
    if (productId) query = query.eq("product_id", Number(productId));
    if (productIds) query = query.in("product_id", productIds);
    return query.order("id", { ascending: true });
  }

  /* Paginated mode, used by the /warehouses inventory tab — a warehouse can
   * hold thousands of products, too many to load and render in one table. */
  if (page) {
    const p = Math.max(1, Number(page));
    const from = (p - 1) * limit;
    const { data, error, count } = await buildQuery(true).range(from, from + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: data || [], total: count ?? 0 });
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
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { product_id, warehouse_id, quantity, reserved, initial_quantity, min_quantity } = body;

  if (!product_id || !warehouse_id) {
    return NextResponse.json({ error: "product_id та warehouse_id обов'язкові" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("inventory")
    .upsert(
      {
        product_id: Number(product_id),
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
  const body = await req.json();
  const { id, quantity, reserved, initial_quantity, min_quantity } = body;

  if (!id) return NextResponse.json({ error: "id обов'язковий" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("inventory")
    .update({
      quantity: Number(quantity ?? 0),
      reserved: Number(reserved ?? 0),
      initial_quantity: Number(initial_quantity ?? 0),
      min_quantity: Number(min_quantity ?? 0),
      updated_at: new Date().toISOString(),
    })
    .eq("id", Number(id))
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
