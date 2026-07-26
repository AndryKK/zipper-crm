import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { npSearchWarehouses } from "@/lib/nova-poshta";

function getSetting(settings: { value: string; text: string }[], key: string) {
  return settings.find((s) => s.value === key)?.text?.trim() ?? "";
}

// Warehouse/postomat search for the manual-TTN form, scoped to a city
// already chosen via /api/nova-poshta/cities.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cityRef = req.nextUrl.searchParams.get("cityRef") ?? "";
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!cityRef) return NextResponse.json({ error: "cityRef обов'язковий" }, { status: 400 });

  const { data: allSettings } = await supabaseServer.from("settings").select("value, text");
  const apiKey = getSetting(allSettings ?? [], "np_api_key") || process.env.NOVA_POSHTA_API_KEY || "";
  if (!apiKey) return NextResponse.json({ error: "np_api_key не налаштовано" }, { status: 400 });

  const warehouses = await npSearchWarehouses(apiKey, cityRef, q);
  return NextResponse.json(warehouses);
}
