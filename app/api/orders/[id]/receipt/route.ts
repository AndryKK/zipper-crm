import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrderDocumentData, renderOrderConfirmationHtml } from "@/lib/order-documents";
import { verifyOrderDocToken } from "@/lib/doc-token";

// isPublic (opened via a token link, e.g. from Viber — no admin session)
// drops the "✕ Закрити" button, which only ever worked for a window this
// app itself opened with window.open(); a customer's link opens as a
// normal page/tab, where window.close() is a silent no-op at best.
function actionBar(isPublic: boolean) {
  return `
  <style>
    .action-bar { display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 14px; }
    .btn {
      padding: 7px 16px; border-radius: 5px; font-size: 12px;
      font-weight: 600; cursor: pointer; border: none; font-family: Arial, sans-serif;
    }
    .btn-dark  { background: #111; color: #fff; }
    .btn-ghost { background: #f1f1f1; color: #333; border: 1px solid #ccc; }
    @media print { .action-bar { display: none !important; } }
  </style>
  <div class="action-bar">
    ${isPublic ? "" : `<button class="btn btn-ghost" onclick="window.close()">✕ Закрити</button>`}
    <button class="btn btn-dark"  onclick="window.print()">🖨 Зберегти / Друкувати</button>
  </div>`;
}

// "Фактура" quick-view button — the same order-confirmation document the
// welcome email sends (see lib/order-emails.ts sendWelcomeEmail), but
// without the greeting paragraph, and printable to PDF via the browser like
// invoice/waybill. ?greeting=1 shows it exactly as the customer received it
// (used by the "welcome email sent" preview on the order page).
//
// Also reachable without a session via ?token=... (see lib/doc-token.ts) —
// the links app/(admin)/orders/[id]/viber-messages generates for pasting
// into Viber must open directly for the customer, not behind the CRM login.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = parseInt(id);

  const session = await auth();
  const token = req.nextUrl.searchParams.get("token");
  const isPublic = !session;
  if (!session && !(await verifyOrderDocToken(orderId, token))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const greeting = req.nextUrl.searchParams.get("greeting") === "1";

  const doc = await getOrderDocumentData(orderId);
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const html = renderOrderConfirmationHtml(doc, { greeting }).replace(/(<body[^>]*>)/, `$1${actionBar(isPublic)}`);

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
