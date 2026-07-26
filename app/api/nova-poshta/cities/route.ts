import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { npSearchCities } from "@/lib/nova-poshta";

function getSetting(settings: { value: string; text: string }[], key: string) {
  return settings.find((s) => s.value === key)?.text?.trim() ?? "";
}

// City search for the manual-TTN form (see app/(admin)/orders/[id]/page.tsx)
// — used when parseNpAddress can't make sense of an order's free-text
// delivery address, so a manager can pick the real city/warehouse straight
// from Nova Poshta instead.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json([]);

  const { data: allSettings } = await supabaseServer.from("settings").select("value, text");
  const apiKey = getSetting(allSettings ?? [], "np_api_key") || process.env.NOVA_POSHTA_API_KEY || "";
  if (!apiKey) return NextResponse.json({ error: "np_api_key не налаштовано" }, { status: 400 });

  const cities = await npSearchCities(apiKey, q);
  return NextResponse.json(cities);
}
