import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await prisma.customString.findMany({ where: { lang: "uk" }, orderBy: { value: "asc" } }));
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as { value: string; text: string; lang: string }[];
  await Promise.all(
    body.map((item) =>
      prisma.customString.updateMany({ where: { value: item.value, lang: item.lang }, data: { text: item.text } })
    )
  );
  return NextResponse.json({ success: true });
}
