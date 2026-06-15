import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await prisma.service.findMany({ where: { lang: "uk" }, orderBy: { priority: "asc" } }));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const maxT = await prisma.service.aggregate({ _max: { translationId: true } });
  const translationId = (maxT._max.translationId ?? 0) + 1;
  const langs = await prisma.lang.findMany({ where: { active: 1 } });
  const maxSort = await prisma.service.aggregate({ _max: { priority: true } });
  const priority = (maxSort._max.priority ?? 0) + 1;
  const items = await Promise.all(langs.map((l) =>
    prisma.service.create({
      data: {
        translationId,
        lang: l.code,
        title: body.title,
        descr: body.descr ?? null,
        img: body.img ?? null,
        priority,
      },
    })
  ));
  return NextResponse.json(items.find((i) => i.lang === "uk") ?? items[0], { status: 201 });
}
