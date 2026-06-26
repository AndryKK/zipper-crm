import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { translateBatchRuToUa } from "@/app/api/translate-descriptions/route";

// POST — перекласти конкретні товари (lang=uk) з RU → UA
// Body: { productIds: number[] }
// Зберігає в БД і повертає перекладений вміст для кожного ID
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY не налаштований" }, { status: 400 });

  const body = await req.json();
  const productIds: number[] = body.productIds ?? [];

  if (!productIds.length) return NextResponse.json({ error: "Немає ID товарів" }, { status: 400 });

  // Тільки lang=uk
  const { data: products, error } = await supabaseServer
    .from("products")
    .select("id, text, descr, lang")
    .in("id", productIds)
    .eq("lang", "uk");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!products?.length) return NextResponse.json({ results: [] });

  const toProcess = (products as any[]).filter((p) => (p.text || "").trim() || (p.descr || "").trim());
  if (!toProcess.length) return NextResponse.json({ results: [] });

  const translated = await translateBatchRuToUa(toProcess, apiKey);

  // Зберегти в БД
  for (const item of translated) {
    if (!item?.id) continue;
    await supabaseServer.from("products").update({
      ...(item.text !== undefined ? { text: item.text } : {}),
      ...(item.descr !== undefined ? { descr: item.descr } : {}),
    }).eq("id", item.id);
  }

  return NextResponse.json({ results: translated });
}
