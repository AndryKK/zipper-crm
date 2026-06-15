import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await prisma.category.findMany({ orderBy: [{ pid: "asc" }, { priority: "asc" }] });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const maxTransId = await prisma.category.aggregate({ _max: { translationId: true } });
  const translationId = (maxTransId._max.translationId ?? 0) + 1;

  const langs = await prisma.lang.findMany({ where: { active: 1 } });
  const items = await Promise.all(
    langs.map((l) =>
      prisma.category.create({
        data: {
          ...body,
          lang: l.code,
          translationId,
          title: l.code === body.lang ? body.title : `[${l.code}] ${body.title}`,
        },
      })
    )
  );
  return NextResponse.json(items.find((i) => i.lang === body.lang) ?? items[0], { status: 201 });
}
