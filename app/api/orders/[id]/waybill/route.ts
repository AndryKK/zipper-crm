import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrderDocumentData, renderWaybillHtml } from "@/lib/order-documents";

const ACTION_BAR = `
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
    <button class="btn btn-ghost" onclick="window.close()">✕ Закрити</button>
    <button class="btn btn-dark"  onclick="window.print()">🖨 Зберегти / Друкувати</button>
  </div>`;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);

  const doc = await getOrderDocumentData(orderId);
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const html = renderWaybillHtml(doc).replace("<body>", `<body>${ACTION_BAR}`);

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
