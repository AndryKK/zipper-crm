import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string; valueId: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { valueId } = await params;
  await prisma.allFilterFilter.delete({ where: { id: parseInt(valueId) } });
  return NextResponse.json({ success: true });
}
