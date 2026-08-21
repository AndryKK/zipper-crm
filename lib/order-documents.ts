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
  img: string | null;
  quantity: number;
  price: number;
  priceBase: number;
  sum: number;
  sumBase: number;
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
    // active=false items are removed from the order — see
    // scripts/add-orders-item-active-column.sql — an invoice/waybill must
    // never list something that's no longer actually being shipped.
    supabaseServer.from("orders_item").select("*").eq("oid", orderId).eq("active", true),
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
    ? await supabaseServer.from("products").select("id, translation_id, title, pcode, img").in("id", productIds)
    : { data: [] };

  const translationIds = [...new Set((products ?? []).map((p: { translation_id: number }) => p.translation_id))];
  const { data: ukProducts } = translationIds.length
    ? await supabaseServer.from("products").select("translation_id, title, pcode").eq("lang", "uk").in("translation_id", translationIds)
    : { data: [] };
  const ukByTranslation = new Map(
    (ukProducts ?? []).map((p: { translation_id: number; title: string; pcode: string | null }) => [p.translation_id, p])
  );

  const prodMap: Record<number, { title: string; pcode: string | null; img: string | null }> = {};
  for (const p of products ?? []) {
    const uk = ukByTranslation.get(p.translation_id);
    prodMap[p.id] = { title: uk?.title ?? p.title, pcode: uk?.pcode ?? p.pcode, img: p.img ?? null };
  }

  const orderTotal = (items ?? []).reduce(
    (sum: number, i: { price: number; quantity: number }) => sum + i.price * i.quantity, 0
  );

  const docNumber = order.doc_field_1 || String(order.id);
  const dateStr = new Date().toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });

  // Supplier selection — supplier2_* is used once the order total exceeds
  // the configured threshold, falling back to supplier_* if not configured.
  // A manager can force this per order (stock-confirmation popup →
  // orders.supplier_override, 1 or 2) when the automatic pick isn't right
  // for a specific case; NULL/unset keeps the automatic behavior.
  const threshold = parseFloat(s["supplier_threshold"]) || DEFAULT_THRESHOLD;
  const autoUseSupplier2 = orderTotal > threshold && (s["supplier2_name"] || "").trim() !== "";
  const useSupplier2 = order.supplier_override === 2 ? true
    : order.supplier_override === 1 ? false
    : autoUseSupplier2;

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
    (item: { product: number; quantity: number; price: number; price_base: number }, idx: number) => {
      const prod = prodMap[item.product];
      const priceBase = item.price_base > 0 ? item.price_base : item.price;
      return {
        idx: idx + 1,
        pcode: prod?.pcode ?? "",
        name: prod?.title ?? `Товар #${item.product}`,
        img: prod?.img ?? null,
        quantity: item.quantity,
        price: item.price,
        priceBase,
        sum: item.price * item.quantity,
        sumBase: priceBase * item.quantity,
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

/* ── Order confirmation ("вітальне повідомлення") ────────────────────────
   Mirrors the legacy storefront's order-confirmation letter (adm/letter*.php)
   — a red-headed items table with product thumbnails and struck-through
   pre-discount prices, plus an order-summary header block. Shared by:
   - the "Фактура" quick-view button (app/api/orders/[id]/receipt), which
     renders it standalone (no greeting) for browsing/printing any time, and
   - the automatic "order received, checking stock" email
     (lib/order-emails.ts sendWelcomeEmail), which renders it with the
     greeting paragraph prepended — same table both places, sent once. */

const CONFIRMATION_ACCENT = "#bc0f0d";

function confirmationItemRowsHtml(items: OrderDocumentItem[]): string {
  return items.map((item) => {
    const discounted = item.priceBase > item.price + 0.001;
    return `
      <tr>
        <td style="padding:10px 8px; border-bottom:1px solid #eee; text-align:center; color:#888; font-size:13px;">${item.idx}.</td>
        <td style="padding:10px 8px; border-bottom:1px solid #eee; width:56px;">
          ${item.img
            ? `<img src="${item.img}" alt="" width="48" height="48" style="width:48px; height:48px; object-fit:cover; border-radius:6px; display:block;"/>`
            : `<div style="width:48px; height:48px; border-radius:6px; background:#f1f1f1;"></div>`}
        </td>
        <td style="padding:10px 8px; border-bottom:1px solid #eee;">
          <div style="font-weight:600; color:${CONFIRMATION_ACCENT}; font-size:14px;">${item.name}</div>
          <div style="color:#888; font-size:12px; margin-top:2px;">Код товару: ${item.pcode || "—"}</div>
        </td>
        <td style="padding:10px 8px; border-bottom:1px solid #eee; text-align:center; white-space:nowrap; font-size:13px;">
          ${item.price.toFixed(2)} грн
          ${discounted ? `<br/><span style="font-size:11px; text-decoration:line-through; color:#999;">${item.priceBase.toFixed(2)} грн</span>` : ""}
        </td>
        <td style="padding:10px 8px; border-bottom:1px solid #eee; text-align:center; white-space:nowrap; font-size:13px;">${item.quantity} шт.</td>
        <td style="padding:10px 8px; border-bottom:1px solid #eee; text-align:center; white-space:nowrap; font-size:13px;">
          ${item.sum.toFixed(2)} грн
          ${discounted ? `<br/><span style="font-size:11px; text-decoration:line-through; color:#999;">${item.sumBase.toFixed(2)} грн</span>` : ""}
        </td>
      </tr>`;
  }).join("");
}

// Exported — app/api/orders/[id]/viber-messages/route.ts reuses this exact
// copy for its "Вітальне повідомлення" Viber message, so the two channels
// never say something different for the same stage.
export function welcomeGreetingText(name: string, orderId: number): string {
  return `Дякуємо за замовлення, ${name}! Ваше замовлення №${orderId} наразі перевіряється на наявність необхідної кількості товару на наших складах. Щойно ми підтвердимо наявність — надішлемо вам повідомлення та рахунок на оплату.\n\nДякуємо, що обираєте Zipper — ми намагаємось опрацювати кожне замовлення якнайшвидше!`;
}

export function renderOrderConfirmationHtml(doc: OrderDocumentData, opts: { greeting?: boolean } = {}): string {
  const { order, items, orderTotal } = doc;
  // original_client_name is purely a greeting/address name for letters —
  // e.g. the person placing the order on someone else's behalf, or a name
  // the client prefers to be addressed by that differs from who the
  // parcel ships to. It never affects Nova Poshta data or the
  // recipient/"Одержувач" line above (recipientLines, both still built
  // from order.person only) — only which name appears in "Дякуємо, {name}".
  const name = order.original_client_name || order.person || order.login || "клієнте";
  const dateStr = new Date(order.date).toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" });
  const baseTotal = items.reduce((s, i) => s + i.sumBase, 0);
  const discountedTotal = baseTotal > orderTotal + 0.001;

  const greetingHtml = opts.greeting
    ? `<p style="margin:0 0 18px; font-size:14px; line-height:1.6; color:#1c1d1f;">${welcomeGreetingText(name, order.id).replace(/\n\n/, "<br/><br/>")}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="UTF-8"/><title>Замовлення №${order.id}</title></head>
<body style="margin:0; padding:16px; font-family:Tahoma,Arial,sans-serif; font-size:14px; line-height:1.35; color:#1c1d1f;">
  <img src="https://zipper.in.ua/img/logo.jpg" alt="Zipper" style="width:150px; margin-bottom:24px; display:block;"/>

  ${greetingHtml}

  <div style="font-weight:700; font-size:15px; margin-bottom:6px;">Замовлення №${order.id} від ${dateStr}</div>
  <div><b>Отримувач:</b> ${order.person || "—"}</div>
  <div><b>Телефон:</b> ${order.phone || "—"}</div>
  <div><b>Адреса доставки:</b> ${order.addr_delivery || "—"}</div>
  ${order.notes ? `<div><b>Примітка:</b> ${order.notes}</div>` : ""}

  <table cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; margin-top:18px;">
    <thead>
      <tr style="background:${CONFIRMATION_ACCENT}; color:#fff;">
        <th style="padding:10px 8px; text-align:center; font-size:12px; font-weight:600; width:4%;"></th>
        <th style="padding:10px 8px; font-size:12px; font-weight:600;" colspan="2">Товар</th>
        <th style="padding:10px 8px; text-align:center; font-size:12px; font-weight:600; width:17%;">Ціна</th>
        <th style="padding:10px 8px; text-align:center; font-size:12px; font-weight:600; width:15%;">Кількість</th>
        <th style="padding:10px 8px; text-align:center; font-size:12px; font-weight:600; width:17%;">Всього</th>
      </tr>
    </thead>
    <tbody>${confirmationItemRowsHtml(items)}</tbody>
    <tfoot>
      <tr style="background:#778085; color:#fff;">
        <td colspan="6" style="padding:14px 18px; text-align:right;">
          <div style="font-weight:700;">Всього по замовленню: ${orderTotal.toFixed(2)} грн</div>
          ${discountedTotal ? `<div style="font-size:12px; text-decoration:line-through; color:#d8dcdd;">${baseTotal.toFixed(2)} грн</div>` : ""}
        </td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
}
