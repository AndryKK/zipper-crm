import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await prisma.lang.findMany({ orderBy: { priority: "asc" } }));
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as { id: number; active: number; visibility: number }[];
  await Promise.all(
    body.map((l) => prisma.lang.update({ where: { id: l.id }, data: { active: l.active, visibility: l.visibility } }))
  );
  return NextResponse.json({ success: true });
}
