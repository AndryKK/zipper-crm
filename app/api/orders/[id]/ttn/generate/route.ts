import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createOrderTtn, estimateDimensionsCm } from "@/lib/order-ttn";

// Standalone TTN (re)generation, independent of the process/confirm-payment
// pipeline — no email, no status change. Used by the Manual Control panel
// to retry after a failure (e.g. the "DateTime cannot be less then now"
// timezone bug) without re-running everything else.
//
// Optional body.weight (kg) overrides the auto-estimated weight without
// touching city/warehouse resolution at all — the "Sender/Recipient
// Warehouse max allowed volumeweight" error (see translateNpError in
// lib/nova-poshta.ts) means the branch itself rejected the auto-estimated
// weight/dimensions, not that the parsed address was wrong, so retrying
// through the full manual city/warehouse picker was more than this needed.
// Dimensions are re-derived from the new weight the same way the
// automatic estimate already does (createOrderTtn's own seat fallback),
// not left at whatever the too-large original guess was.
//
// Optional body.forceMainSenderWarehouse: true skips the order's own
// is_oversized flag and always sends through np_sender_warehouse_ref
// (Відділення №100) — for when the branch that's actually rejecting the
// shipment is the *oversized* sender branch itself (its own volumeweight
// cap, or a stale/unrecognized Ref — see createOrderTtn's own comment).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const weight = typeof body.weight === "number" && Number.isFinite(body.weight) && body.weight > 0 ? body.weight : undefined;
  const seat = weight != null ? { weight, ...estimateDimensionsCm(weight) } : undefined;
  const forceMainSenderWarehouse = body.forceMainSenderWarehouse === true;

  const result = await createOrderTtn(parseInt(id), { skipPostomat: true, seat, forceMainSenderWarehouse });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, ttn: result.ttn, demo: result.demo });
}
