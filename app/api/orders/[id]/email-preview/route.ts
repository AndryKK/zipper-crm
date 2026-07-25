import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrderDocumentData } from "@/lib/order-documents";
import { renderPaymentRequestEmail, renderPaymentConfirmedEmail } from "@/lib/email-templates";

// Read-only — renders the exact subject/HTML the resend/automatic pipeline
// would send, without sending or generating PDF attachments, so a manager
// can review (and, via `note`, adjust) the text before committing to send.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const kind = req.nextUrl.searchParams.get("kind");
  const note = req.nextUrl.searchParams.get("note") || undefined;
  if (kind !== "invoice" && kind !== "confirmed") {
    return NextResponse.json({ error: "Невідомий тип листа" }, { status: 400 });
  }

  const doc = await getOrderDocumentData(parseInt(id));
  if (!doc) return NextResponse.json({ error: "Замовлення не знайдено" }, { status: 404 });

  const { subject, html } = kind === "confirmed"
    ? renderPaymentConfirmedEmail(doc, doc.order.ttn ?? null, { note })
    : renderPaymentRequestEmail(doc, { note });

  return NextResponse.json({ subject, html });
}
