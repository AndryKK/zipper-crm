import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await prisma.setting.findMany({ where: { lang: "uk" }, orderBy: { value: "asc" } });
  return NextResponse.json(items);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const updates: { value: string; text: string; lang: string }[] = await req.json();

  await Promise.all(updates.map((u) =>
    prisma.setting.upsert({
      where: { value_lang: { value: u.value, lang: u.lang } },
      update: { text: u.text },
      create: { value: u.value, text: u.text, lang: u.lang },
    })
  ));

  return NextResponse.json({ success: true });
}
