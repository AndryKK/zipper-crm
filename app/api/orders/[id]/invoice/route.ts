import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrderDocumentData, renderInvoiceHtml } from "@/lib/order-documents";
import { verifyOrderDocToken } from "@/lib/doc-token";

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

// Also reachable without a session via ?token=... (see lib/doc-token.ts) —
// used by app/(admin)/orders/[id]/viber-messages's copy-to-Viber links.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = parseInt(id);

  const session = await auth();
  const token = req.nextUrl.searchParams.get("token");
  const isPublic = !session;
  if (!session && !(await verifyOrderDocToken(orderId, token))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const doc = await getOrderDocumentData(orderId);
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const html = renderInvoiceHtml(doc).replace("<body>", `<body>${actionBar(isPublic)}`);

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
