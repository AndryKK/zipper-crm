import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveEffectiveDiscountForOrder } from "@/lib/pricing";

// Read-only — what the "Знижка клієнта, %" field on the stock-confirmation
// popup should show for this order's CURRENT active items/quantities (see
// resolveEffectiveDiscountForOrder). Polled by that popup after every
// quantity edit, as long as a manager hasn't typed their own value into
// the field yet — see discountTouched in orders/[id]/page.tsx.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const discountPercent = await resolveEffectiveDiscountForOrder(parseInt(id));
  return NextResponse.json({ discountPercent });
}
