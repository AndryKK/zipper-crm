import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "Файл не знайдено" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

  const log: string[] = [];
  let updated = 0;

  for (const row of rows) {
    const pcode = String(row["Артикул"] ?? row["pcode"] ?? "").trim();
    if (!pcode) continue;

    const price = parseFloat(String(row["Ціна (грн)"] ?? row["price"] ?? 0));
    const price_sale = row["Акційна ціна"] ? parseFloat(String(row["Акційна ціна"])) : null;
    const price2 = row["Ціна 2"] ? parseFloat(String(row["Ціна 2"])) : null;
    const price2n = row["Мін. к-сть 2"] ? parseFloat(String(row["Мін. к-сть 2"])) : null;
    const price3 = row["Ціна 3"] ? parseFloat(String(row["Ціна 3"])) : null;
    const price3n = row["Мін. к-сть 3"] ? parseFloat(String(row["Мін. к-сть 3"])) : null;

    const products = await prisma.product.findMany({ where: { pcode } });
    if (!products.length) {
      log.push(`⚠ Артикул "${pcode}" не знайдено`);
      continue;
    }

    await prisma.product.updateMany({
      where: { pcode },
      data: { price, price_sale, price2, price2n, price3, price3n },
    });
    updated++;
    log.push(`✓ ${pcode} → ціна ${price} грн`);
  }

  return NextResponse.json({ updated, log });
}
