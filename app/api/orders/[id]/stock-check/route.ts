import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkOrderStock } from "@/lib/order-stock";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await checkOrderStock(parseInt(id));
  return NextResponse.json(result);
}
