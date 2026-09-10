import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

// "Інший платник" — the order's invoice ("Платник") and waybill ("Покупець")
// get issued to this sole trader / entity instead of the parcel recipient.
// See scripts/add-orders-alt-payer-column.sql. This route ONLY stores the
// data — every document, the client email attachments and the Viber links
// read orders.alt_payer through lib/order-documents.ts on demand, so the
// save alone is the "regenerate". Nothing is re-sent to the client here;
// that stays a deliberate, separate manager action.

const FIELDS = ["name", "code", "address", "iban", "bank", "phone"] as const;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);
  const body = await req.json().catch(() => ({}));

  let altPayer: Record<string, string> | null = null;
  if (body.altPayer && typeof body.altPayer === "object") {
    const clean: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = String(body.altPayer[f] ?? "").trim();
      if (v) clean[f] = v;
    }
    // All fields blank -> treat the checkbox as off. A "Платник" line with
    // nothing in it would just be a broken document.
    altPayer = Object.keys(clean).length ? clean : null;
  }

  const { error } = await supabaseServer
    .from("orders").update({ alt_payer: altPayer }).eq("id", orderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ altPayer });
}
