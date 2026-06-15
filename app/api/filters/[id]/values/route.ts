import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const maxT = await prisma.allFilterFilter.aggregate({ _max: { translationId: true } });
  const translationId = (maxT._max.translationId ?? 0) + 1;
  const langs = await prisma.lang.findMany({ where: { active: 1 } });
  const items = await Promise.all(langs.map((l) => prisma.allFilterFilter.create({ data: { translationId, pid: parseInt(id), lang: l.code, title: l.code === body.lang ? body.title : `[${l.code}] ${body.title}` } })));
  return NextResponse.json(items.find((i) => i.lang === body.lang) ?? items[0], { status: 201 });
}
