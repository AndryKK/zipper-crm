import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { chars, lang } = await req.json();

  await prisma.productChar.deleteMany({ where: { pid: parseInt(id), lang } });

  if (chars?.length) {
    await prisma.productChar.createMany({
      data: chars.map((c: { title: string; value: string }, i: number) => ({
        pid: parseInt(id),
        title: c.title,
        value: c.value,
        lang,
        priority: i,
      })),
    });
  }

  return NextResponse.json({ success: true });
}
