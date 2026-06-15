import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { transliterate } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const q = searchParams.get("q") ?? "";
  const limit = 20;
  const where = { lang: "uk", ...(q ? { title: { contains: q } } : {}) };
  const [items, total] = await Promise.all([
    prisma.news.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { priority: "asc" } }),
    prisma.news.count({ where }),
  ]);
  return NextResponse.json({ items, total, pages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const maxT = await prisma.news.aggregate({ _max: { translationId: true } });
  const translationId = (maxT._max.translationId ?? 0) + 1;
  const langs = await prisma.lang.findMany({ where: { active: 1 } });
  const maxSort = await prisma.news.aggregate({ _max: { priority: true } });
  const priority = (maxSort._max.priority ?? 0) + 1;
  const items = await Promise.all(langs.map((l) =>
    prisma.news.create({
      data: {
        translationId,
        lang: l.code,
        title: body.title,
        uri: body.uri || transliterate(body.title),
        descr: body.descr ?? null,
        text: body.text ?? null,
        img: body.img ?? null,
        priority,
        data: body.data ? new Date(body.data) : new Date(),
      },
    })
  ));
  return NextResponse.json(items.find((i) => i.lang === "uk") ?? items[0], { status: 201 });
}
