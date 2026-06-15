import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const item = await prisma.service.findUnique({ where: { id: parseInt(id) } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(item);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const item = await prisma.service.findUnique({ where: { id: parseInt(id) } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.service.updateMany({
    where: { translationId: item.translationId },
    data: { priority: body.priority, img: body.img },
  });
  const updated = await prisma.service.update({
    where: { id: parseInt(id) },
    data: { title: body.title, descr: body.descr },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const item = await prisma.service.findUnique({ where: { id: parseInt(id) } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.service.deleteMany({ where: { translationId: item.translationId } });
  return NextResponse.json({ success: true });
}
