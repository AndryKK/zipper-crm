import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createOrderTtn } from "@/lib/order-ttn";

// Standalone TTN (re)generation, independent of the process/confirm-payment
// pipeline — no email, no status change. Used by the Manual Control panel
// to retry after a failure (e.g. the "DateTime cannot be less then now"
// timezone bug) without re-running everything else.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await createOrderTtn(parseInt(id), { skipPostomat: true });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, ttn: result.ttn, demo: result.demo });
}
