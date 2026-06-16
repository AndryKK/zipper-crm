import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouse_id");
  const productId = searchParams.get("product_id");
  const q = searchParams.get("q");

  let query = supabaseServer
    .from("inventory")
    .select(`
      *,
      product:products!inventory_product_id_fkey(id, title, pcode, lang),
      warehouse:warehouses!inventory_warehouse_id_fkey(id, title)
    `);

  if (warehouseId) query = query.eq("warehouse_id", Number(warehouseId));
  if (productId)   query = query.eq("product_id", Number(productId));

  const { data, error } = await query.order("id", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let result = data || [];

  /* Filter by product title / pcode after join */
  if (q) {
    const lower = q.toLowerCase();
    result = result.filter((r: any) =>
      r.product?.title?.toLowerCase().includes(lower) ||
      r.product?.pcode?.toLowerCase().includes(lower)
    );
  }

  return NextResponse.json(result);
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
