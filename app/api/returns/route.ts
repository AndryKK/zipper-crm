import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { resolveLegacyReturns } from "@/lib/returns-resolve";

// Global list of every return — including legacy storefront-submitted rows
// (oid is null on those; they only have the free-text order/code/quantity
// fields) alongside ones created from an order page in this CRM. Legacy rows
// get their oid/product/qty auto-resolved here before being sent to the UI.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  let query = supabaseServer.from("orders_returns").select("*").order("date", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(await resolveLegacyReturns(data ?? []));
}
