import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const lang = searchParams.get("lang") ?? "uk";
  const q = searchParams.get("q") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "50");

  const where = {
    lang,
    ...(q && {
      OR: [
        { title: { contains: q } },
        { pcode: { contains: q } },
        { uri: { contains: q } },
      ],
    }),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ priority: "asc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        categories: { include: { category: { select: { title: true } } } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { categoryIds, ...data } = body;

  const maxTransId = await prisma.product.aggregate({ _max: { translationId: true } });
  const translationId = (maxTransId._max.translationId ?? 0) + 1;

  const langs = await prisma.lang.findMany({ where: { active: 1 } });

  const products = await Promise.all(
    langs.map((l) =>
      prisma.product.create({
        data: {
          ...data,
          lang: l.code,
          translationId,
          title: l.code === data.lang ? data.title : `[${l.code}] ${data.title}`,
        },
      })
    )
  );

  const mainProduct = products.find((p) => p.lang === (data.lang ?? "uk"))!;

  if (categoryIds?.length) {
    await prisma.productCategory.createMany({
      data: categoryIds.map((cid: number) => ({ pid: mainProduct.id, cid })),
    });
  }

  return NextResponse.json(mainProduct, { status: 201 });
}
