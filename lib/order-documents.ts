import { supabaseServer } from "@/lib/supabase";

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

export function amountToWords(amount: number): string {
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

export type OrderDocumentItem = {
  idx: number;
  pcode: string;
  name: string;
  quantity: number;
  price: number;
  sum: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OrderDocumentData = {
  order: any;
  items: OrderDocumentItem[];
  orderTotal: number;
  docNumber: string;
  dateStr: string;
  supplierName: string;
  supplierAccount: string;
  supplierBank: string;
  supplierEdrpou: string;
  supplierLines: string;
  recipientLines: string;
  amountWords: string;
};

const DEFAULT_THRESHOLD = 3000;

export async function getOrderDocumentData(orderId: number): Promise<OrderDocumentData | null> {
  const [{ data: order }, { data: items }, { data: allSettings }] = await Promise.all([
    supabaseServer.from("orders").select("*").eq("id", orderId).single(),
    supabaseServer.from("orders_item").select("*").eq("oid", orderId),
    supabaseServer.from("settings").select("value, text"),
  ]);

  if (!order) return null;

  const s: Record<string, string> = {};
  for (const row of allSettings ?? []) s[row.value] = row.text;

  // Fetch product titles + pcode. Products are stored per-language with each
  // language row having its own distinct id, and orders_item.product is that
  // exact row id (often a non-"uk" row, e.g. orders placed on the Russian
  // site) — matching by id alone (no lang filter) is what actually finds
  // the purchased product row. Documents/emails must always show the
  // Ukrainian name regardless of which storefront the order came from, so
  // once we have that row's translation_id we look up its "uk" sibling and
  // prefer that title (falling back to whatever title the order's own
  // product row had if no Ukrainian translation exists).
  const productIds = (items ?? []).map((i: { product: number }) => i.product);
  const { data: products } = productIds.length
    ? await supabaseServer.from("products").select("id, translation_id, title, pcode").in("id", productIds)
    : { data: [] };

  const translationIds = [...new Set((products ?? []).map((p: { translation_id: number }) => p.translation_id))];
  const { data: ukProducts } = translationIds.length
    ? await supabaseServer.from("products").select("translation_id, title, pcode").eq("lang", "uk").in("translation_id", translationIds)
    : { data: [] };
  const ukByTranslation = new Map(
    (ukProducts ?? []).map((p: { translation_id: number; title: string; pcode: string | null }) => [p.translation_id, p])
  );

  const prodMap: Record<number, { title: string; pcode: string | null }> = {};
  for (const p of products ?? []) {
    const uk = ukByTranslation.get(p.translation_id);
    prodMap[p.id] = { title: uk?.title ?? p.title, pcode: uk?.pcode ?? p.pcode };
  }

  const orderTotal = (items ?? []).reduce(
    (sum: number, i: { price: number; quantity: number }) => sum + i.price * i.quantity, 0
  );

  const docNumber = order.doc_field_1 || String(order.id);
  const dateStr = new Date().toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });

  // Supplier selection — supplier2_* is used once the order total exceeds
  // the configured threshold, falling back to supplier_* if not configured.
  const threshold = parseFloat(s["supplier_threshold"]) || DEFAULT_THRESHOLD;
  const useSupplier2 = orderTotal > threshold && (s["supplier2_name"] || "").trim() !== "";

  const supplierName    = (useSupplier2 ? s["supplier2_name"]    : s["supplier_name"])    || "";
  const supplierAccount = (useSupplier2 ? s["supplier2_account"] : s["supplier_account"]) || "";
  const supplierBank    = (useSupplier2 ? s["supplier2_bank"]    : s["supplier_bank"])    || "";
  const supplierEdrpou  = (useSupplier2 ? s["supplier2_edrpou"]  : s["supplier_edrpou"])  || "";

  const supplierLines = [
    supplierName,
    supplierAccount ? `Р/р ${supplierAccount}` : "",
    supplierBank,
    supplierEdrpou ? `ЄДРПОУ ${supplierEdrpou}` : "",
  ].filter(Boolean).join("<br/>");

  const recipientLines = [
    order.person || "",
    order.phone || "",
    order.addr_delivery || "",
  ].filter(Boolean).join("<br/>");

  const docItems: OrderDocumentItem[] = (items ?? []).map(
    (item: { product: number; quantity: number; price: number }, idx: number) => {
      const prod = prodMap[item.product];
      return {
        idx: idx + 1,
        pcode: prod?.pcode ?? "",
        name: prod?.title ?? `Товар #${item.product}`,
        quantity: item.quantity,
        price: item.price,
        sum: item.price * item.quantity,
      };
    }
  );

  const amountWords = amountToWords(orderTotal);

  return {
    order,
    items: docItems,
    orderTotal,
    docNumber,
    dateStr,
    supplierName,
    supplierAccount,
    supplierBank,
    supplierEdrpou,
    supplierLines,
    recipientLines,
    amountWords,
  };
}

/* ── Document HTML bodies (shared by the browser view and email attachments) ── */

const DOC_STYLE = `
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
    .req-table { border-collapse: collapse; margin-bottom: 18pt; font-size: 11pt; line-height: 1.6; }
    .req-table td { padding: 1.5pt 0; vertical-align: top; }
    .req-label { white-space: nowrap; padding-right: 16pt; text-decoration: underline; font-size: 11pt; }
    .req-value { font-size: 11pt; padding-left: 4pt; }
    .inv-title { text-align: center; font-size: 14pt; font-weight: 700; margin: 14pt 0 2pt; }
    .inv-date  { text-align: center; font-size: 13pt; font-weight: 700; margin-bottom: 14pt; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 2pt; font-size: 10.5pt; }
    .items-table th {
      border: 1px solid #000; background: #d9d9d9;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
      padding: 4pt 5pt; text-align: center; font-weight: 700;
      vertical-align: middle; line-height: 1.3; font-size: 10pt;
    }
    .items-table td { border: 1px solid #000; padding: 4pt 5pt; vertical-align: middle; }
    .c { text-align: center; }
    .r { text-align: right; }
    .totals { margin-top: 4pt; margin-bottom: 16pt; }
    .totals-row { display: flex; justify-content: flex-end; font-size: 11pt; line-height: 1.9; }
    .totals-row .lbl { min-width: 148pt; text-align: right; padding-right: 8pt; }
    .totals-row .val { min-width: 56pt;  text-align: right; font-weight: 700; }
    .summary-line { font-size: 11pt; margin-bottom: 10pt; }
    .words { font-size: 11pt; line-height: 1.65; margin-bottom: 30pt; }
    .words b { font-weight: 700; }
    .sign-block { margin-top: 10pt; display: flex; justify-content: flex-end; }
    .sign-block.split { justify-content: space-between; gap: 40pt; }
    .sign-col { flex: 1; font-size: 11pt; }
    .sign-inner { display: flex; align-items: flex-end; gap: 6pt; font-size: 11pt; }
    .sign-line { width: 160pt; border-bottom: 1px solid #000; margin-bottom: 1pt; }
    .sign-col .sign-line { width: auto; margin-top: 26pt; }
    .footer { text-align: right; font-size: 9pt; color: #555; margin-top: 14pt; font-style: italic; }
    @page { size: A4; margin: 0; }
    @media print { body { padding: 12mm 16mm 12mm; } }
`;

function itemRowsHtml(items: OrderDocumentItem[]): string {
  return items.map((item) => `
      <tr>
        <td class="c">${item.idx}.</td>
        <td class="c">${item.pcode}</td>
        <td>${item.name}</td>
        <td class="c">${item.quantity}</td>
        <td class="c">штук</td>
        <td class="r">${item.price.toFixed(2)}</td>
        <td class="r">${item.sum.toFixed(2)}</td>
      </tr>`).join("");
}

const ITEMS_TABLE_COLGROUP = `
    <colgroup>
      <col style="width:22pt"/><col style="width:52pt"/><col/>
      <col style="width:38pt"/><col style="width:28pt"/>
      <col style="width:52pt"/><col style="width:58pt"/>
    </colgroup>`;

export function renderInvoiceHtml(doc: OrderDocumentData): string {
  const { order, items, orderTotal, docNumber, dateStr, supplierLines, recipientLines, amountWords } = doc;
  return `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="UTF-8"/><title>Рахунок-фактура ${docNumber}</title><style>${DOC_STYLE}</style></head>
<body>
  <table class="req-table">
    <tbody>
      <tr><td class="req-label">Постачальник:</td><td class="req-value">${supplierLines}</td></tr>
      <tr><td style="padding-top:6pt"></td></tr>
      <tr><td class="req-label">Одержувач:</td><td class="req-value">${recipientLines || "—"}</td></tr>
      <tr><td class="req-label">Платник:</td><td class="req-value"><b>той самий</b></td></tr>
      <tr><td class="req-label">Замовлення:</td><td class="req-value">Замовлення №${order.id}</td></tr>
    </tbody>
  </table>

  <div class="inv-title">Рахунок-фактура №${docNumber}</div>
  <div class="inv-date">від ${dateStr}</div>

  <table class="items-table">
    ${ITEMS_TABLE_COLGROUP}
    <thead>
      <tr>
        <th rowspan="2">№</th><th rowspan="2">Артикул</th><th rowspan="2">Назва</th>
        <th colspan="2">Кількість</th><th rowspan="2">Ціна<br/>без ПДВ</th><th rowspan="2">Сума без<br/>ПДВ</th>
      </tr>
      <tr><th>кількість</th><th>од.</th></tr>
    </thead>
    <tbody>${itemRowsHtml(items)}</tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span class="lbl">Разом без ПДВ:</span><span class="val">${orderTotal.toFixed(2)}</span></div>
    <div class="totals-row"><span class="lbl">ПДВ:</span><span class="val">0.00</span></div>
    <div class="totals-row"><span class="lbl">Всього із ПДВ:</span><span class="val">${orderTotal.toFixed(2)}</span></div>
  </div>

  <div class="words">
    Всього на суму:<br/><b>${amountWords}</b><br/>ПДВ:&nbsp;&nbsp;0.00 грн.
  </div>

  <div class="sign-block">
    <div class="sign-inner"><span>Виписав(ла)</span><span class="sign-line"></span></div>
  </div>

  <div class="footer">Рахунок дійсний до сплати протягом трьох банківських днів.</div>
</body>
</html>`;
}

export function renderWaybillHtml(doc: OrderDocumentData): string {
  const { items, orderTotal, docNumber, dateStr, supplierLines, recipientLines, amountWords } = doc;
  return `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="UTF-8"/><title>Видаткова накладна ${docNumber}</title><style>${DOC_STYLE}</style></head>
<body>
  <div class="inv-title">Видаткова накладна №${docNumber}</div>
  <div class="inv-date">від ${dateStr}</div>

  <table class="req-table">
    <tbody>
      <tr><td class="req-label">Постачальник:</td><td class="req-value">${supplierLines}</td></tr>
      <tr><td style="padding-top:6pt"></td></tr>
      <tr><td class="req-label">Покупець:</td><td class="req-value">${recipientLines || "—"}</td></tr>
    </tbody>
  </table>

  <table class="items-table">
    ${ITEMS_TABLE_COLGROUP}
    <thead>
      <tr>
        <th rowspan="2">№</th><th rowspan="2">Артикул</th><th rowspan="2">Товар</th>
        <th colspan="2">Кількість</th><th rowspan="2">Ціна<br/>без ПДВ</th><th rowspan="2">Сума без<br/>ПДВ</th>
      </tr>
      <tr><th>кількість</th><th>од.</th></tr>
    </thead>
    <tbody>${itemRowsHtml(items)}</tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span class="lbl">Всього:</span><span class="val">${orderTotal.toFixed(2)}</span></div>
    <div class="totals-row"><span class="lbl">Сума ПДВ:</span><span class="val">0.00</span></div>
    <div class="totals-row"><span class="lbl">Всього із ПДВ:</span><span class="val">${orderTotal.toFixed(2)}</span></div>
  </div>

  <div class="summary-line">Всього найменувань: ${items.length} на суму ${orderTotal.toFixed(2)} грн.</div>

  <div class="words">
    <b>${amountWords}</b><br/>У т.ч. ПДВ: нуль гривень, 00 коп.
  </div>

  <div class="sign-block split">
    <div class="sign-col">Від постачальника<div class="sign-line"></div></div>
    <div class="sign-col">Отримав(ла)<div class="sign-line"></div></div>
  </div>
</body>
</html>`;
}
