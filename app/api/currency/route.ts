import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await prisma.currency.findMany({ orderBy: { id: "asc" } }));
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as { id: number; rate: number; enabled: number }[];
  await Promise.all(
    body.map((c) => prisma.currency.update({ where: { id: c.id }, data: { rate: c.rate, enabled: c.enabled } }))
  );
  return NextResponse.json({ success: true });
}
