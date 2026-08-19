import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { npSearchAddress } from "@/lib/nova-poshta";

function getSetting(settings: { value: string; text: string }[], key: string) {
  return settings.find((s) => s.value === key)?.text?.trim() ?? "";
}

// Combined city+warehouse "one field" search for the delivery-address
// picker (components/admin/np-address-picker.tsx) — see npSearchAddress's
// own doc comment in lib/nova-poshta.ts for why this is two real NP calls
// under one search box instead of a single API call.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 2) return NextResponse.json([]);

  const { data: allSettings } = await supabaseServer.from("settings").select("value, text");
  const apiKey = getSetting(allSettings ?? [], "np_api_key") || process.env.NOVA_POSHTA_API_KEY || "";
  if (!apiKey) return NextResponse.json({ error: "np_api_key не налаштовано" }, { status: 400 });

  const results = await npSearchAddress(apiKey, q);
  return NextResponse.json(results);
}
