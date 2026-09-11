import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { createOrderTtnManual } from "@/lib/order-ttn";

// Manual TTN creation, bypassing parseNpAddress entirely — the escape
// hatch offered on the order page whenever the free-text delivery address
// can't be parsed (or the city/warehouse it names isn't found in Nova
// Poshta). The manager resolves city/warehouse themselves via
// /api/nova-poshta/{cities,warehouses} and this just creates the TTN with
// those explicit refs.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);
  const body = await req.json().catch(() => ({}));

  const { cityRef, warehouseRef, isPostomat, seat, codAmount, isOrganization, edrpou, orgContactName, orgContactPhone, nonCashPayment } = body;
  if (!cityRef || !warehouseRef) {
    return NextResponse.json({ error: "Оберіть місто і відділення/поштомат" }, { status: 400 });
  }
  if (isPostomat) {
    const s = seat ?? {};
    if (![s.weight, s.length, s.width, s.height].every((n: number) => Number.isFinite(n) && n > 0)) {
      return NextResponse.json({ error: "Вкажіть коректні габарити для поштомату" }, { status: 400 });
    }
  }
  if (isOrganization && !String(edrpou ?? "").trim()) {
    return NextResponse.json({ error: "Вкажіть код ЄДРПОУ для організації" }, { status: 400 });
  }

  // Persist to the order too — this dialog used to be a pure per-call
  // override (deliberately, so a one-off manual TTN never changed the
  // order's own stored organization status), but that meant a manager who
  // ticked "Оплата за доставку безготівково" only here (never through the
  // stock-confirmation popup or the "Організація (ЄДРПОУ)" card) had it
  // silently vanish on the next page load or retry — nothing ever wrote it
  // to orders.np_noncash_payment. Now every place that edits this trio
  // (this route, /process, /ttn/generate) saves it the same way, so
  // whatever a manager last set here is what a later retry falls back to.
  await supabaseServer.from("orders").update({
    is_organization: !!isOrganization,
    edrpou: isOrganization ? String(edrpou).trim() : null,
    np_noncash_payment: isOrganization ? !!nonCashPayment : false,
  }).eq("id", orderId);

  const result = await createOrderTtnManual(orderId, {
    cityRef,
    warehouseRef,
    isPostomat: !!isPostomat,
    seat: isPostomat ? seat : undefined,
    codAmount: isPostomat ? undefined : codAmount,
    isOrganization: !!isOrganization,
    edrpou: isOrganization ? String(edrpou).trim() : undefined,
    orgContactName: isOrganization && orgContactName ? String(orgContactName).trim() : undefined,
    orgContactPhone: isOrganization && orgContactPhone ? String(orgContactPhone).trim() : undefined,
    nonCashPayment: isOrganization ? !!nonCashPayment : undefined,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
