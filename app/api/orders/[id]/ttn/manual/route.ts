import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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

  const { cityRef, warehouseRef, isPostomat, seat, codAmount } = body;
  if (!cityRef || !warehouseRef) {
    return NextResponse.json({ error: "Оберіть місто і відділення/поштомат" }, { status: 400 });
  }
  if (isPostomat) {
    const s = seat ?? {};
    if (![s.weight, s.length, s.width, s.height].every((n: number) => Number.isFinite(n) && n > 0)) {
      return NextResponse.json({ error: "Вкажіть коректні габарити для поштомату" }, { status: 400 });
    }
  }

  const result = await createOrderTtnManual(orderId, {
    cityRef,
    warehouseRef,
    isPostomat: !!isPostomat,
    seat: isPostomat ? seat : undefined,
    codAmount: isPostomat ? undefined : codAmount,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
