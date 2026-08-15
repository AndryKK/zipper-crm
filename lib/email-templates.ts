import type { OrderDocumentData } from "@/lib/order-documents";

const LOGO_URL = "https://zipper.in.ua/img/logo.jpg";
const ACCENT = "#6366f1";

function layout(previewText: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0; padding:0; background:#f0f4f8; font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${previewText}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8; padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 16px rgba(15,23,42,0.06);">
          <tr>
            <td style="background:#ffffff; padding:24px 32px; text-align:center; border-bottom:1px solid #edf1f8;">
              <img src="${LOGO_URL}" alt="Zipper" width="190" height="76" style="display:inline-block; max-width:190px; height:auto;"/>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px; background:#f8fafc; border-top:1px solid #edf1f8; text-align:center;">
              <p style="margin:0; font-size:12px; color:#94a3b8; line-height:1.6;">
                Це автоматичний лист від Zipper. Якщо у вас виникли питання — просто дайте відповідь на цей лист.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function itemsTable(items: OrderDocumentData["items"]): string {
  const rows = items.map((i) => `
    <tr>
      <td style="padding:8px 0; border-bottom:1px solid #edf1f8; font-size:13px; color:#1e293b;">${i.name}</td>
      <td style="padding:8px 0; border-bottom:1px solid #edf1f8; font-size:13px; color:#64748b; text-align:center; white-space:nowrap;">${i.quantity} шт</td>
      <td style="padding:8px 0; border-bottom:1px solid #edf1f8; font-size:13px; color:#1e293b; text-align:right; white-space:nowrap;">${i.sum.toFixed(2)} грн</td>
    </tr>`).join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      ${rows}
    </table>`;
}

function noteBlock(note?: string): string {
  if (!note?.trim()) return "";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; margin:0 0 20px;">
      <tr>
        <td style="padding:14px 18px; font-size:13px; color:#78350f; line-height:1.6; white-space:pre-wrap;">${note.trim()}</td>
      </tr>
    </table>`;
}

export type EmailRenderOptions = { note?: string; subject?: string };

export function renderPaymentRequestEmail(doc: OrderDocumentData, opts: EmailRenderOptions = {}): { subject: string; html: string } {
  const { order, orderTotal, docNumber, supplierLines } = doc;
  const name = order.person || order.login || "Шановний(а) клієнте";
  const branch = order.addr_delivery || "—";

  const body = `
    <h1 style="margin:0 0 8px; font-size:20px; color:#0f172a;">Наявність підтверджено, ${name}!</h1>
    <p style="margin:0 0 20px; font-size:14px; color:#64748b; line-height:1.6;">
      Ми підтвердили наявність товару за замовленням №${order.id} на наших складах. Чекаємо оплату та готуємо ваше замовлення до відправки — рахунок №${docNumber} та видаткова накладна додані до цього листа файлами. Одразу після оплати ви отримаєте номер ТТН для відстеження посилки.
    </p>
    ${noteBlock(opts.note)}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; border-radius:10px; margin-bottom:20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px; font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em;">Сума до сплати</p>
          <p style="margin:0; font-size:28px; font-weight:700; color:${ACCENT};">${orderTotal.toFixed(2)} грн</p>
        </td>
      </tr>
    </table>

    ${itemsTable(doc.items)}

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5; border-radius:10px; margin:20px 0;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px; font-size:12px; color:#047857; text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">Відділення отримання (Нова Пошта)</p>
          <p style="margin:0; font-size:14px; color:#065f46; line-height:1.5;">${branch}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="padding:16px 20px; border:1px solid #edf1f8; border-radius:10px;">
          <p style="margin:0 0 4px; font-size:12px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em;">Реквізити для оплати</p>
          <p style="margin:0; font-size:13px; color:#334155; line-height:1.7;">${supplierLines}</p>
        </td>
      </tr>
    </table>`;

  return {
    subject: opts.subject?.trim() || `Рахунок №${docNumber} до сплати — замовлення №${order.id} (${orderTotal.toFixed(2)} грн)`,
    html: layout(`Рахунок №${docNumber} на суму ${orderTotal.toFixed(2)} грн`, body),
  };
}

export function renderPaymentConfirmedEmail(doc: OrderDocumentData, ttn: string | null, opts: EmailRenderOptions = {}): { subject: string; html: string } {
  const { order } = doc;
  const name = order.person || order.login || "Шановний(а) клієнте";

  const trackBlock = ttn ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5; border-radius:10px; margin:20px 0;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px; font-size:12px; color:#047857; text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">Номер ТТН (Нова Пошта)</p>
          <p style="margin:0; font-size:18px; font-weight:700; color:#065f46; font-family:monospace;">${ttn}</p>
          <p style="margin:8px 0 0;">
            <a href="https://novaposhta.ua/tracking/${ttn}" style="font-size:13px; color:${ACCENT}; text-decoration:none; font-weight:600;">Відстежити посилку →</a>
          </p>
        </td>
      </tr>
    </table>` : "";

  const body = `
    <h1 style="margin:0 0 8px; font-size:20px; color:#0f172a;">Оплату підтверджено, ${name}!</h1>
    <p style="margin:0 0 20px; font-size:14px; color:#64748b; line-height:1.6;">
      Ми отримали й підтвердили оплату за замовленням №${order.id}. ${ttn
        ? "Замовлення вже передано в доставку — номер ТТН для відстеження посилки додано нижче."
        : "Замовлення готується до відправки — номер ТТН для відстеження посилки надішлемо окремим повідомленням, щойно його буде створено."}
    </p>
    ${noteBlock(opts.note)}
    ${trackBlock}
    <p style="margin:24px 0 0; font-size:14px; color:#334155; line-height:1.6;">
      Дякуємо, що обрали Zipper! 💚 Скоро ваш товар буде доставлено.
    </p>`;

  return {
    subject: opts.subject?.trim() || `Оплату отримано — замовлення №${order.id} готується до відправки`,
    html: layout(`Оплату за замовлення №${order.id} отримано`, body),
  };
}
