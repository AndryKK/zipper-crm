import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const item = await prisma.manager.findUnique({ where: { id: parseInt(id) } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Update shared fields for all langs
  await prisma.manager.updateMany({
    where: { translationId: item.translationId },
    data: { phone: body.phone, email: body.email, skype: body.skype, img: body.img, priority: body.priority },
  });
  const updated = await prisma.manager.update({ where: { id: parseInt(id) }, data: { title: body.title, descr: body.descr } });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const item = await prisma.manager.findUnique({ where: { id: parseInt(id) } });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.manager.deleteMany({ where: { translationId: item.translationId } });
  return NextResponse.json({ success: true });
}
