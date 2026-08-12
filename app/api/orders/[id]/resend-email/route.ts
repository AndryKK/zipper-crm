import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { sendPaymentRequestEmail, sendPaymentConfirmedEmail, sendWelcomeEmail } from "@/lib/order-emails";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);
  const body = await req.json().catch(() => ({}));
  const kind: string = body.kind;
  const email: string | undefined = body.email?.trim() || undefined;
  const subject: string | undefined = body.subject?.trim() || undefined;
  const note: string | undefined = body.note?.trim() || undefined;

  if (kind !== "invoice" && kind !== "confirmed" && kind !== "welcome") {
    return NextResponse.json({ error: "Невідомий тип листа" }, { status: 400 });
  }

  const result = kind === "invoice"
    ? await sendPaymentRequestEmail(orderId, email, { subject, note })
    : kind === "confirmed"
    ? await sendPaymentConfirmedEmail(orderId, email, { subject, note })
    : await sendWelcomeEmail(orderId, email, { subject, note });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  if (kind === "welcome") {
    await supabaseServer
      .from("orders")
      .update({ welcome_email_sent: true, welcome_email_sent_at: new Date().toISOString() })
      .eq("id", orderId);
  }

  return NextResponse.json({ ok: true });
}
