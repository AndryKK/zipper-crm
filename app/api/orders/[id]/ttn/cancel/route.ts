import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelOrderTtn } from "@/lib/order-ttn";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await cancelOrderTtn(parseInt(id));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, demo: result.demo });
}
