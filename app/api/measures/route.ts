import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await prisma.measure.findMany({ where: { lang: "uk" }, orderBy: { title: "asc" } }));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const maxT = await prisma.measure.aggregate({ _max: { translationId: true } });
  const translationId = (maxT._max.translationId ?? 0) + 1;
  const langs = await prisma.lang.findMany({ where: { active: 1 } });
  const items = await Promise.all(langs.map((l) => prisma.measure.create({ data: { translationId, lang: l.code, title: body.title, short_title: body.short_title ?? body.title } })));
  return NextResponse.json(items.find((i) => i.lang === body.lang) ?? items[0], { status: 201 });
}
