import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id: parseInt(id) },
    include: {
      categories: { include: { category: true } },
      photos: { orderBy: { priority: "asc" } },
      photos2: { orderBy: { priority: "asc" } },
      chars: { orderBy: { priority: "asc" } },
      colors: { include: { productWith: { select: { id: true, title: true, img: true, lang: true } } } },
      together: { include: { productWith: { select: { id: true, title: true, img: true, lang: true } } } },
      filterItems: { include: { filter: { include: { parent: true } } } },
    },
  });

  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(product);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { categoryIds, filterIds, ...data } = body;

  const product = await prisma.product.update({
    where: { id: parseInt(id) },
    data,
  });

  if (categoryIds !== undefined) {
    await prisma.productCategory.deleteMany({ where: { pid: product.id } });
    if (categoryIds.length) {
      await prisma.productCategory.createMany({
        data: categoryIds.map((cid: number) => ({ pid: product.id, cid })),
        skipDuplicates: true,
      });
    }
  }

  if (filterIds !== undefined) {
    await prisma.allFilterItem.deleteMany({ where: { pid: product.id } });
    if (filterIds.length) {
      await prisma.allFilterItem.createMany({
        data: filterIds.map((fid: number) => ({ pid: product.id, fid })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json(product);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.product.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
