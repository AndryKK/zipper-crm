import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

/* ── Ukrainian number-to-words ──────────────────────────────────────── */
const ONES_F  = ["", "одна", "дві", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять"];
const ONES_M  = ["", "один", "два", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять"];
const TEENS   = ["десять", "одинадцять", "дванадцять", "тринадцять", "чотирнадцять",
                 "п'ятнадцять", "шістнадцять", "сімнадцять", "вісімнадцять", "дев'ятнадцять"];
const TENS    = ["", "десять", "двадцять", "тридцять", "сорок", "п'ятдесят",
                 "шістдесят", "сімдесят", "вісімдесят", "дев'яносто"];
const HUNDREDS = ["", "сто", "двісті", "триста", "чотириста", "п'ятсот",
                  "шістсот", "сімсот", "вісімсот", "дев'ятсот"];

function plural(n: number, one: string, few: string, many: string) {
  const t = Math.abs(n) % 100;
  const u = t % 10;
  if (t >= 11 && t <= 19) return many;
  if (u === 1) return one;
  if (u >= 2 && u <= 4) return few;
  return many;
}

function chunk(n: number, feminine: boolean): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rest >= 10 && rest <= 19) {
    parts.push(TEENS[rest - 10]);
  } else {
    const t = Math.floor(rest / 10);
    const u = rest % 10;
    if (t) parts.push(TENS[t]);
    if (u) parts.push(feminine ? ONES_F[u] : ONES_M[u]);
  }
  return parts.join(" ");
}

function amountToWords(amount: number): string {
  const fixed = Math.round(amount * 100);
  const hrn   = Math.floor(fixed / 100);
  const kop   = fixed % 100;

  if (hrn === 0) {
    return `Нуль гривень, ${String(kop).padStart(2, "0")} коп.`;
  }

  const parts: string[] = [];
  const billions  = Math.floor(hrn / 1_000_000_000);
  const millions  = Math.floor((hrn % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((hrn % 1_000_000) / 1_000);
  const remainder = hrn % 1_000;

  if (billions) {
    parts.push(chunk(billions, false));
    parts.push(plural(billions, "мільярд", "мільярди", "мільярдів"));
  }
  if (millions) {
    parts.push(chunk(millions, false));
    parts.push(plural(millions, "мільйон", "мільйони", "мільйонів"));
  }
  if (thousands) {
    parts.push(chunk(thousands, true)); // тисяча — feminine
    parts.push(plural(thousands, "тисяча", "тисячі", "тисяч"));
  }
  if (remainder) {
    parts.push(chunk(remainder, true)); // гривня — feminine
  }

  const hrnWord = plural(hrn % 100 >= 11 && hrn % 100 <= 19 ? 5 : hrn % 10, "гривня", "гривні", "гривень");

  const words = parts.join(" ");
  const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
  return `${capitalized} ${hrnWord}, ${String(kop).padStart(2, "0")} коп.`;
}

/* ────────────────────────────────────────────────────────────────────── */

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);

  const [{ data: order }, { data: items }, { data: allSettings }] = await Promise.all([
    supabaseServer.from("orders").select("*").eq("id", orderId).single(),
    supabaseServer.from("orders_item").select("*").eq("oid", orderId),
    supabaseServer.from("settings").select("value, text"),
  ]);

  if (!order) return new NextResponse("Not found", { status: 404 });

  const s: Record<string, string> = {};
  for (const row of allSettings ?? []) s[row.value] = row.text;

  // Fetch product titles + pcode
  const productIds = (items ?? []).map((i: { product: number }) => i.product);
  const { data: products } = productIds.length
    ? await supabaseServer.from("products").select("id, title, pcode").in("id", productIds).eq("lang", "uk")
    : { data: [] };

  const prodMap: Record<number, { title: string; pcode: string | null }> = {};
  for (const p of products ?? []) prodMap[p.id] = p;

  const invoiceNum = order.doc_field_1 || `ЗМ-${orderId}`;
  const orderTotal = (items ?? []).reduce(
    (sum: number, i: { price: number; quantity: number }) => sum + i.price * i.quantity, 0
  );

  // Дата рахунку — сьогодні (день виписки), а не дата замовлення
  const dateStr = new Date().toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });

  // Supplier block
  const supplierName    = s["supplier_name"]    || "";
  const supplierAccount = s["supplier_account"] || "";
  const supplierBank    = s["supplier_bank"]    || "";
  const supplierEdrpou  = s["supplier_edrpou"]  || "";

  const supplierLines = [
    supplierName,
    supplierAccount ? `Р/р ${supplierAccount}` : "",
    supplierBank,
    supplierEdrpou ? `ЄДРПОУ ${supplierEdrpou}` : "",
  ].filter(Boolean).join("<br/>");

  // Recipient block
  const recipientLines = [
    order.phone || "",
    order.addr_delivery || "",
  ].filter(Boolean).join("<br/>");

  // Table rows
  const itemRows = (items ?? []).map((item: { product: number; quantity: number; price: number }, idx: number) => {
    const prod = prodMap[item.product];
    const name  = prod?.title  ?? `Товар #${item.product}`;
    const pcode = prod?.pcode  ?? "";
    const sum   = item.price * item.quantity;
    return `
      <tr>
        <td class="c">${idx + 1}.</td>
        <td class="c">${pcode}</td>
        <td>${name}</td>
        <td class="c qty-num">${item.quantity}</td>
        <td class="c qty-unit">штук</td>
        <td class="r">${item.price.toFixed(2)}</td>
        <td class="r">${sum.toFixed(2)}</td>
      </tr>`;
  }).join("");

  const amountWords = amountToWords(orderTotal);

  const html = `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8"/>
  <title>Рахунок-фактура ${invoiceNum}</title>
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

    /* ── Кнопки (тільки на екрані) ── */
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

    /* ── Реквізити (таблиця для точного вирівнювання) ── */
    .req-table { border-collapse: collapse; margin-bottom: 18pt; font-size: 11pt; line-height: 1.6; }
    .req-table td { padding: 1.5pt 0; vertical-align: top; }
    .req-label {
      white-space: nowrap;
      padding-right: 16pt;
      text-decoration: underline;
      font-size: 11pt;
    }
    .req-value { font-size: 11pt; padding-left: 4pt; }

    /* ── Заголовок рахунку ── */
    .inv-title { text-align: center; font-size: 14pt; font-weight: 700; margin: 14pt 0 2pt; }
    .inv-date  { text-align: center; font-size: 13pt; font-weight: 700; margin-bottom: 14pt; }

    /* ── Таблиця товарів ── */
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

    /* ── Підсумки ── */
    .totals { margin-top: 4pt; margin-bottom: 16pt; }
    .totals-row {
      display: flex; justify-content: flex-end;
      font-size: 11pt; line-height: 1.9;
    }
    .totals-row .lbl { min-width: 148pt; text-align: right; padding-right: 8pt; }
    .totals-row .val { min-width: 56pt;  text-align: right; font-weight: 700; }

    /* ── Сума прописом ── */
    .words { font-size: 11pt; line-height: 1.65; margin-bottom: 30pt; }
    .words b { font-weight: 700; }

    /* ── Підпис ── */
    .sign-block { margin-top: 10pt; display: flex; justify-content: flex-end; }
    .sign-inner {
      display: flex; align-items: flex-end; gap: 6pt;
      font-size: 11pt;
    }
    .sign-line { width: 160pt; border-bottom: 1px solid #000; margin-bottom: 1pt; }

    /* ── Примітка ── */
    .footer { text-align: right; font-size: 9pt; color: #555; margin-top: 14pt; font-style: italic; }

    @page { size: A4; margin: 0; }
    @media print { body { padding: 12mm 16mm 12mm; } }
  </style>
</head>
<body>

  <div class="action-bar">
    <button class="btn btn-ghost" onclick="window.close()">✕ Закрити</button>
    <button class="btn btn-dark"  onclick="window.print()">🖨 Зберегти / Друкувати</button>
  </div>

  <!-- ── Реквізити ── -->
  <table class="req-table">
    <tbody>
      <tr>
        <td class="req-label">Постачальник:</td>
        <td class="req-value">${supplierLines}</td>
      </tr>
      <tr><td style="padding-top:6pt"></td></tr>
      <tr>
        <td class="req-label">Одержувач:</td>
        <td class="req-value">${recipientLines || "—"}</td>
      </tr>
      <tr>
        <td class="req-label">Платник:</td>
        <td class="req-value"><b>той самий</b></td>
      </tr>
      <tr>
        <td class="req-label">Замовлення:</td>
        <td class="req-value">Замовлення №${orderId}</td>
      </tr>
    </tbody>
  </table>

  <!-- ── Заголовок ── -->
  <div class="inv-title">Рахунок-фактура №${invoiceNum}</div>
  <div class="inv-date">від ${dateStr}</div>

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
        <th rowspan="2">Назва</th>
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
    <div class="totals-row"><span class="lbl">Разом без ПДВ:</span><span class="val">${orderTotal.toFixed(2)}</span></div>
    <div class="totals-row"><span class="lbl">ПДВ:</span><span class="val">0.00</span></div>
    <div class="totals-row"><span class="lbl">Всього із ПДВ:</span><span class="val">${orderTotal.toFixed(2)}</span></div>
  </div>

  <!-- ── Сума прописом ── -->
  <div class="words">
    Всього на суму:<br/>
    <b>${amountWords}</b><br/>
    ПДВ:&nbsp;&nbsp;0.00 грн.
  </div>

  <!-- ── Підпис ── -->
  <div class="sign-block">
    <div class="sign-inner">
      <span>Виписав(ла)</span>
      <span class="sign-line"></span>
    </div>
  </div>

  <!-- ── Примітка ── -->
  <div class="footer">Рахунок дійсний до сплати протягом трьох банківських днів.</div>

  <script>window.addEventListener("load", () => window.print());</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
