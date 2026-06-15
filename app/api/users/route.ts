import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const where = q ? { OR: [{ login: { contains: q } }, { person: { contains: q } }, { phone: { contains: q } }] } : {};
  const items = await prisma.user.findMany({ where, orderBy: { id: "desc" }, take: 100, omit: { pass: true } });
  return NextResponse.json(items);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ...data } = await req.json();
  const item = await prisma.user.update({ where: { id }, data, omit: { pass: true } });
  return NextResponse.json(item);
}
