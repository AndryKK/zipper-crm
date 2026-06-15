import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const products = await prisma.product.findMany({
    where: { lang: "uk", active: 1 },
    orderBy: [{ priority: "asc" }, { id: "asc" }],
    include: { categories: { include: { category: { select: { title: true } } } } },
  });

  const rows = products.map((p) => ({
    "Артикул": p.pcode ?? "",
    "Назва": p.title,
    "Категорія": p.categories.map((c) => c.category.title).join(", "),
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
