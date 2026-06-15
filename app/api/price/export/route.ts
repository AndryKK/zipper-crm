import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: products } = await supabaseServer
    .from("products")
    .select("*, labelAction:label_action, translationId:translation_id, categories:products_categories(cid)")
    .eq("lang", "uk")
    .eq("active", 1)
    .order("priority", { ascending: true })
    .order("id", { ascending: true });

  const allProducts = products || [];

  // Fetch category titles for all category ids referenced
  const allCids = [...new Set(allProducts.flatMap((p: any) => p.categories.map((c: any) => c.cid)))];
  let catTitleMap: Record<number, string> = {};
  if (allCids.length) {
    const { data: cats } = await supabaseServer
      .from("categories")
      .select("translation_id, title")
      .in("translation_id", allCids)
      .eq("lang", "uk");
    for (const cat of cats || []) {
      catTitleMap[(cat as any).translation_id] = (cat as any).title;
    }
  }

  const rows = allProducts.map((p: any) => ({
    "Артикул": p.pcode ?? "",
    "Назва": p.title,
    "Категорія": p.categories.map((c: any) => catTitleMap[c.cid] ?? "").filter(Boolean).join(", "),
    "Ціна (грн)": p.price,
    "Акційна ціна": p.price_sale ?? "",
    "Ціна 2": p.price2 ?? "",
    "Мін. к-сть 2": p.price2n ?? "",
    "Ціна 3": p.price3 ?? "",
    "Мін. к-сть 3": p.price3n ?? "",
    "Мін. замовлення": p.minquantity,
    "URI": p.uri,
    "ID": p.id,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Прайс");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="price.xlsx"`,
    },
  });
}
