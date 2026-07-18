import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrderDocumentData } from "@/lib/order-documents";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);

  const doc = await getOrderDocumentData(orderId);
  if (!doc) return new NextResponse("Not found", { status: 404 });

  const {
    items, orderTotal, docNumber, dateStr, supplierLines, recipientLines, amountWords,
  } = doc;

  const itemRows = items.map((item) => `
      <tr>
        <td class="c">${item.idx}.</td>
        <td class="c">${item.pcode}</td>
        <td>${item.name}</td>
        <td class="c qty-num">${item.quantity}</td>
        <td class="c qty-unit">штук</td>
        <td class="r">${item.price.toFixed(2)}</td>
        <td class="r">${item.sum.toFixed(2)}</td>
      </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8"/>
  <title>Видаткова накладна ${docNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      color: #000;
      background: #fff;
      padding: 15mm 20mm 15mm;
      max-width: 210mm;
      margin: 0 auto;
    }

    .action-bar {
      display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 14px;
    }
    .btn {
      padding: 7px 16px; border-radius: 5px; font-size: 12px;
      font-weight: 600; cursor: pointer; border: none; font-family: Arial, sans-serif;
    }
    .btn-dark  { background: #111; color: #fff; }
    .btn-ghost { background: #f1f1f1; color: #333; border: 1px solid #ccc; }
    @media print { .action-bar { display: none !important; } }

    .req-table { border-collapse: collapse; margin-bottom: 18pt; font-size: 11pt; line-height: 1.6; }
    .req-table td { padding: 1.5pt 0; vertical-align: top; }
    .req-label {
      white-space: nowrap;
      padding-right: 16pt;
      text-decoration: underline;
      font-size: 11pt;
    }
    .req-value { font-size: 11pt; padding-left: 4pt; }

    .inv-title { text-align: center; font-size: 14pt; font-weight: 700; margin: 14pt 0 2pt; }
    .inv-date  { text-align: center; font-size: 13pt; font-weight: 700; margin-bottom: 14pt; }

    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 2pt; font-size: 10.5pt; }
    .items-table th {
      border: 1px solid #000;
      background: #d9d9d9;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      padding: 4pt 5pt;
      text-align: center;
      font-weight: 700;
      vertical-align: middle;
      line-height: 1.3;
      font-size: 10pt;
    }
    .items-table td {
      border: 1px solid #000;
      padding: 4pt 5pt;
      vertical-align: middle;
    }
    .tc { text-align: center; }
    .tr { text-align: right; }
    .qty-n { border-right: none !important; text-align: right; padding-right: 2pt; }
    .qty-u { border-left: none !important;  text-align: left;  padding-left: 2pt; font-size: 9pt; color: #333; }

    .totals { margin-top: 4pt; margin-bottom: 16pt; }
    .totals-row {
      display: flex; justify-content: flex-end;
      font-size: 11pt; line-height: 1.9;
    }
    .totals-row .lbl { min-width: 148pt; text-align: right; padding-right: 8pt; }
    .totals-row .val { min-width: 56pt;  text-align: right; font-weight: 700; }

    .summary-line { font-size: 11pt; margin-bottom: 10pt; }

    .words { font-size: 11pt; line-height: 1.65; margin-bottom: 30pt; }
    .words b { font-weight: 700; }

    .sign-block {
      margin-top: 10pt; display: flex; justify-content: space-between; gap: 40pt;
    }
    .sign-col { flex: 1; font-size: 11pt; }
    .sign-line { border-bottom: 1px solid #000; margin-top: 26pt; }

    @page { size: A4; margin: 0; }
    @media print { body { padding: 12mm 16mm 12mm; } }
  </style>
</head>
<body>

  <div class="action-bar">
    <button class="btn btn-ghost" onclick="window.close()">✕ Закрити</button>
    <button class="btn btn-dark"  onclick="window.print()">🖨 Зберегти / Друкувати</button>
  </div>

  <!-- ── Заголовок ── -->
  <div class="inv-title">Видаткова накладна №${docNumber}</div>
  <div class="inv-date">від ${dateStr}</div>

  <!-- ── Реквізити ── -->
  <table class="req-table">
    <tbody>
      <tr>
        <td class="req-label">Постачальник:</td>
        <td class="req-value">${supplierLines}</td>
      </tr>
      <tr><td style="padding-top:6pt"></td></tr>
      <tr>
        <td class="req-label">Покупець:</td>
        <td class="req-value">${recipientLines || "—"}</td>
      </tr>
    </tbody>
  </table>

  <!-- ── Таблиця товарів ── -->
  <table class="items-table">
    <colgroup>
      <col style="width:22pt"/>
      <col style="width:52pt"/>
      <col/>
      <col style="width:38pt"/>
      <col style="width:28pt"/>
      <col style="width:52pt"/>
      <col style="width:58pt"/>
    </colgroup>
    <thead>
      <tr>
        <th rowspan="2">№</th>
        <th rowspan="2">Артикул</th>
        <th rowspan="2">Товар</th>
        <th colspan="2">Кількість</th>
        <th rowspan="2">Ціна<br/>без ПДВ</th>
        <th rowspan="2">Сума без<br/>ПДВ</th>
      </tr>
      <tr>
        <th>кількість</th>
        <th>од.</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <!-- ── Підсумки ── -->
  <div class="totals">
    <div class="totals-row"><span class="lbl">Всього:</span><span class="val">${orderTotal.toFixed(2)}</span></div>
    <div class="totals-row"><span class="lbl">Сума ПДВ:</span><span class="val">0.00</span></div>
    <div class="totals-row"><span class="lbl">Всього із ПДВ:</span><span class="val">${orderTotal.toFixed(2)}</span></div>
  </div>

  <div class="summary-line">Всього найменувань: ${items.length} на суму ${orderTotal.toFixed(2)} грн.</div>

  <!-- ── Сума прописом ── -->
  <div class="words">
    <b>${amountWords}</b><br/>
    У т.ч. ПДВ: нуль гривень, 00 коп.
  </div>

  <!-- ── Підпис ── -->
  <div class="sign-block">
    <div class="sign-col">Від постачальника<div class="sign-line"></div></div>
    <div class="sign-col">Отримав(ла)<div class="sign-line"></div></div>
  </div>

</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
