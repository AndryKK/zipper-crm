import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("product_id");
  const warehouseId = searchParams.get("warehouse_id");

  if (!productId || !warehouseId) {
    return NextResponse.json({ error: "product_id та warehouse_id обов'язкові" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("inventory_history")
    .select("*")
    .eq("product_id", Number(productId))
    .eq("warehouse_id", Number(warehouseId))
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
