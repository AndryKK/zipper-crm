import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
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
//
// Optional body.isOrganization/edrpou/nonCashPayment: normally this route
// leans entirely on finishTtnCreation's own fallback to the order's stored
// is_organization/edrpou/np_noncash_payment (see lib/order-ttn.ts) — a bare
// retry never needs to resend them. But the order page's weight-only retry
// (and the plain "Перегенерувати" button — see generateTtnManually in
// orders/[id]/page.tsx) now sends them explicitly every time, and this
// route re-persists them here too, exactly like /api/orders/[id]/process
// does — a manager watching the retry UI sees the same checkbox state it
// started with (not just trusting an invisible DB fallback) and a weight
// retry after a "max allowed volumeweight" error can never silently drop
// back to Cash payment.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);
  const body = await req.json().catch(() => ({}));
  const weight = typeof body.weight === "number" && Number.isFinite(body.weight) && body.weight > 0 ? body.weight : undefined;
  const seat = weight != null ? { weight, ...estimateDimensionsCm(weight) } : undefined;
  const forceMainSenderWarehouse = body.forceMainSenderWarehouse === true;

  let isOrganization: boolean | undefined;
  let edrpou: string | undefined;
  let nonCashPayment: boolean | undefined;
  if (typeof body.isOrganization === "boolean") {
    isOrganization = body.isOrganization;
    edrpou = isOrganization ? String(body.edrpou ?? "").trim() : undefined;
    nonCashPayment = isOrganization ? !!body.nonCashPayment : undefined;
    if (isOrganization && !edrpou) {
      return NextResponse.json({ error: "Вкажіть код ЄДРПОУ для організації" }, { status: 400 });
    }
    await supabaseServer.from("orders").update({
      is_organization: isOrganization,
      edrpou: isOrganization ? edrpou : null,
      np_noncash_payment: isOrganization ? !!nonCashPayment : false,
    }).eq("id", orderId);
  }

  const result = await createOrderTtn(orderId, {
    skipPostomat: true, seat, forceMainSenderWarehouse,
    isOrganization, edrpou, nonCashPayment,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, ttn: result.ttn, demo: result.demo });
}
