import type { OrderDocumentData } from "@/lib/order-documents";

const LOGO_URL = "https://zipper.in.ua/img/logo.jpg";
const ACCENT = "#6366f1";

// Exported — app/api/users/forgot-password/route.ts reuses this same
// order-agnostic wrapper (it only needs previewText/bodyHtml) so the
// "new password" email matches the branding of every other customer email
// instead of inventing its own layout.
export function layout(previewText: string, bodyHtml: string): string {
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

export type EmailRenderOptions = {
  note?: string;
  subject?: string;
  // "confirmed" (default) — first-time processing, nothing about the
  // order changed since the customer placed it.
  // "itemsChanged" — a manager removed/added items (out-of-stock swap
  // etc.) since the customer's original checkout; the "availability
  // confirmed" framing would be misleading, so this copy instead says the
  // order's contents were updated and asks the client to review them.
  // "discountChanged" — the "змінити %% і надіслати повторно" resend
  // action; requires discountPercent.
  reason?: "confirmed" | "itemsChanged" | "discountChanged";
  discountPercent?: number;
};

// Exported — app/api/orders/[id]/viber-messages/route.ts reuses this exact
// copy for its "Рахунок та накладна" Viber message, so the two channels
// never drift apart (the CRM's own request: Viber text must say exactly
// what the email said).
export function paymentRequestIntro(name: string, order: OrderDocumentData["order"], docNumber: string, opts: EmailRenderOptions): { title: string; text: string } {
  if (opts.reason === "discountChanged") {
    const pct = (opts.discountPercent ?? 0).toString().replace(".", ",");
    return {
      title: `Ми перерахували вартість товару застосувавши вашу особисту знижку ${pct}%, ${name}!`,
      text: `Оновлений рахунок №${docNumber} та видаткова накладна з урахуванням знижки додані до цього листа файлами. Будь ласка, перевірте суму та оплатіть — одразу після оплати ви отримаєте номер ТТН для відстеження посилки.`,
    };
  }
  if (opts.reason === "itemsChanged") {
    return {
      title: `Склад замовлення оновлено, ${name}!`,
      text: `Ми надіслали вам список актуальних товарів за замовленням №${order.id} та сформували на них рахунок №${docNumber} — будь ласка, перевірте склад замовлення та оплатіть. Якщо потрібні зміни, зв'яжіться з нами, і ми все скоригуємо.`,
    };
  }
  return {
    title: `Наявність підтверджено, ${name}!`,
    text: `Ми підтвердили наявність товару за замовленням №${order.id} на наших складах. Чекаємо оплату та готуємо ваше замовлення до відправки — рахунок №${docNumber} та видаткова накладна додані до цього листа файлами. Одразу після оплати ви отримаєте номер ТТН для відстеження посилки.`,
  };
}

export function renderPaymentRequestEmail(doc: OrderDocumentData, opts: EmailRenderOptions = {}): { subject: string; html: string } {
  const { order, orderTotal, docNumber, supplierLines } = doc;
  // Greeting-only name — see renderOrderConfirmationHtml's comment in
  // lib/order-documents.ts. Never used for NP/shipping data.
  const name = order.original_client_name || order.person || order.login || "Шановний(а) клієнте";
  const branch = order.addr_delivery || "—";
  const intro = paymentRequestIntro(name, order, docNumber, opts);

  const body = `
    <h1 style="margin:0 0 8px; font-size:20px; color:#0f172a;">${intro.title}</h1>
    <p style="margin:0 0 20px; font-size:14px; color:#64748b; line-height:1.6;">
      ${intro.text}
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

// Exported for the same reason as paymentRequestIntro above.
export function paymentConfirmedIntro(name: string, order: OrderDocumentData["order"], ttn: string | null): { title: string; text: string } {
  return {
    title: `Оплату підтверджено, ${name}!`,
    text: `Ми отримали й підтвердили оплату за замовленням №${order.id}. ${ttn
      ? "Замовлення вже передано в доставку — номер ТТН для відстеження посилки додано нижче."
      : "Замовлення готується до відправки — номер ТТН для відстеження посилки надішлемо окремим повідомленням, щойно його буде створено."}`,
  };
}

export function renderPaymentConfirmedEmail(doc: OrderDocumentData, ttn: string | null, opts: EmailRenderOptions = {}): { subject: string; html: string } {
  const { order } = doc;
  // See renderPaymentRequestEmail's comment — original_client_name is a
  // greeting-only name, never used for NP/shipping data.
  const name = order.original_client_name || order.person || order.login || "Шановний(а) клієнте";
  const intro = paymentConfirmedIntro(name, order, ttn);

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
    <h1 style="margin:0 0 8px; font-size:20px; color:#0f172a;">${intro.title}</h1>
    <p style="margin:0 0 20px; font-size:14px; color:#64748b; line-height:1.6;">
      ${intro.text}
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

// Internal "нове замовлення" ping to the shop's own inbox — see
// lib/order-emails.ts's sendNewOrderNotification and the webhook that
// calls it (app/api/webhooks/inventory-sync's "orders"+"INSERT" branch).
// Deliberately minimal: just the order number and a link straight into
// this CRM, per the exact request that introduced this (2026-09-04) — not
// the customer-facing confirmation email, this is staff-facing.
export function renderNewOrderNotificationEmail(orderId: number, crmUrl: string): { subject: string; html: string } {
  const orderUrl = `${crmUrl}/orders/${orderId}`;
  const body = `
    <h1 style="margin:0 0 8px; font-size:20px; color:#0f172a;">Є нове замовлення №${orderId}</h1>
    <p style="margin:0 0 24px; font-size:14px; color:#64748b; line-height:1.6;">
      Щойно надійшло нове замовлення на сайті.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:8px; background:${ACCENT};">
          <a href="${orderUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block; padding:12px 24px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none;">
            Відкрити замовлення →
          </a>
        </td>
      </tr>
    </table>`;

  return {
    subject: `Є нове замовлення №${orderId}`,
    html: layout(`Нове замовлення №${orderId}`, body),
  };
}

// Internal "оплату отримано" ping — see sendPaymentReceivedNotification in
// lib/order-emails.ts, the only caller (fired from the confirm-payment
// route the moment an order's status flips to "Оплачено"). Mirrors
// renderNewOrderNotificationEmail's shape/tone exactly; a separate function
// rather than a shared one because the two pings are conceptually
// different events (order exists vs. order paid) that could easily need
// different copy/recipients later.
export function renderPaymentReceivedNotificationEmail(
  orderId: number,
  crmUrl: string,
  opts: { amount?: number; ttn?: string | null } = {}
): { subject: string; html: string } {
  const orderUrl = `${crmUrl}/orders/${orderId}`;
  const amountLine = typeof opts.amount === "number"
    ? `<p style="margin:0 0 8px; font-size:14px; color:#0f172a;"><strong>Сума:</strong> ${opts.amount.toFixed(2)} грн</p>`
    : "";
  const ttnLine = opts.ttn
    ? `<p style="margin:0 0 24px; font-size:14px; color:#0f172a;"><strong>ТТН:</strong> ${opts.ttn}</p>`
    : "";
  const body = `
    <h1 style="margin:0 0 8px; font-size:20px; color:#0f172a;">Отримано оплату по замовленню №${orderId}</h1>
    <p style="margin:0 0 16px; font-size:14px; color:#64748b; line-height:1.6;">
      Замовлення щойно позначено як оплачене в CRM.
    </p>
    ${amountLine}
    ${ttnLine || `<div style="margin-bottom:24px;"></div>`}
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:8px; background:${ACCENT};">
          <a href="${orderUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block; padding:12px 24px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none;">
            Відкрити замовлення →
          </a>
        </td>
      </tr>
    </table>`;

  return {
    subject: `Оплата отримана — замовлення №${orderId}`,
    html: layout(`Оплата отримана — замовлення №${orderId}`, body),
  };
}

// "Забули пароль" — see app/api/users/forgot-password/route.ts. Sends the
// FRESH password just generated there (the account's real one is bcrypt-
// hashed and can't be recovered) — mirrors the legacy PHP site's own
// email_recover2 copy in spirit ("Пароль успішно відновлено. Логін: %s
// Пароль: %s"), just single-step instead of its two-step link flow.
export function renderNewPasswordEmail(login: string, newPassword: string): { subject: string; html: string } {
  const body = `
    <h1 style="margin:0 0 8px; font-size:20px; color:#0f172a;">Пароль відновлено</h1>
    <p style="margin:0 0 20px; font-size:14px; color:#64748b; line-height:1.6;">
      Ви (або хтось від вашого імені) запросили відновлення пароля на сайті Zipper. Ось ваш новий пароль для входу:
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff; border-radius:10px; margin:0 0 20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px; font-size:12px; color:${ACCENT}; text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">Логін</p>
          <p style="margin:0 0 14px; font-size:15px; font-weight:600; color:#0f172a;">${login}</p>
          <p style="margin:0 0 4px; font-size:12px; color:${ACCENT}; text-transform:uppercase; letter-spacing:0.04em; font-weight:600;">Новий пароль</p>
          <p style="margin:0; font-size:20px; font-weight:700; color:#0f172a; font-family:monospace; letter-spacing:0.05em;">${newPassword}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0; font-size:13px; color:#94a3b8; line-height:1.6;">
      Якщо ви не запитували відновлення пароля — просто проігноруйте цей лист, доступ до вашого акаунту цим не надається нікому, хто не має доступу до цієї поштової скриньки.
    </p>`;

  return {
    subject: "Zipper — новий пароль до вашого акаунту",
    html: layout("Ваш новий пароль для входу на Zipper", body),
  };
}
