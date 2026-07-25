import PDFDocument from "pdfkit";
import path from "path";
import type { OrderDocumentData, OrderDocumentItem } from "@/lib/order-documents";

// Native pdfkit generation (no headless browser) — safe to run in a Vercel
// serverless function with no extra runtime dependencies. Roboto is bundled
// under lib/fonts because pdfkit's built-in fonts (Helvetica/Times) have no
// Cyrillic glyphs at all; Roboto's hinted build covers the full Ukrainian
// alphabet plus № and ₴ (verified against fontkit's cmap before picking it).
const FONT_REGULAR = path.join(process.cwd(), "lib", "fonts", "Roboto-Regular.ttf");
const FONT_BOLD    = path.join(process.cwd(), "lib", "fonts", "Roboto-Bold.ttf");

const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

type Column = { label: string; width: number; align?: "left" | "right" | "center" };

const ITEM_COLUMNS: Column[] = [
  { label: "№",       width: 26,  align: "center" },
  { label: "Артикул", width: 62,  align: "center" },
  { label: "Назва",   width: CONTENT_WIDTH - 26 - 62 - 55 - 62 - 72, align: "left" },
  { label: "К-сть",   width: 55,  align: "center" },
  { label: "Ціна",    width: 62,  align: "right" },
  { label: "Сума",    width: 72,  align: "right" },
];

function newDoc() {
  // font: false skips pdfkit's default Helvetica load in the constructor —
  // it reads Helvetica.afm via a dynamically built path that Vercel's file
  // tracer can't follow, so that file never makes it into the deployed
  // bundle and the very first PDFDocument() call throws ENOENT. We only
  // ever use the bundled Roboto below, so the built-in font is never needed.
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    // @ts-expect-error -- pdfkit accepts `font: false` at runtime to skip
    // loading the built-in Helvetica metrics; @types/pdfkit only types
    // this option as `string`.
    font: false,
  });
  doc.registerFont("regular", FONT_REGULAR);
  doc.registerFont("bold", FONT_BOLD);
  doc.font("regular").fontSize(10);
  return doc;
}

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number): number {
  if (y + needed > PAGE_HEIGHT - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function drawLabelBlock(doc: PDFKit.PDFDocument, y: number, label: string, value: string): number {
  const lines = value.split("<br/>").filter(Boolean);
  doc.font("bold").fontSize(10).text(label, MARGIN, y, { continued: false, underline: true });
  y += 14;
  doc.font("regular").fontSize(10);
  for (const line of lines.length ? lines : ["—"]) {
    doc.text(line, MARGIN + 10, y, { width: CONTENT_WIDTH - 10 });
    y += 13;
  }
  return y + 4;
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number): number {
  const rowH = 24;
  doc.rect(MARGIN, y, CONTENT_WIDTH, rowH).fillAndStroke("#d9d9d9", "#000000");
  doc.fillColor("#000000").font("bold").fontSize(9);
  let cx = MARGIN;
  for (const col of ITEM_COLUMNS) {
    doc.text(col.label, cx + 3, y + 8, { width: col.width - 6, align: col.align });
    cx += col.width;
  }
  cx = MARGIN;
  doc.lineWidth(1).strokeColor("#000000");
  for (const col of ITEM_COLUMNS) {
    doc.moveTo(cx, y).lineTo(cx, y + rowH).stroke();
    cx += col.width;
  }
  doc.moveTo(cx, y).lineTo(cx, y + rowH).stroke();
  doc.font("regular").fontSize(9);
  return y + rowH;
}

function drawItemsTable(doc: PDFKit.PDFDocument, startY: number, items: OrderDocumentItem[]): number {
  let y = ensureSpace(doc, startY, 24);
  y = drawTableHeader(doc, y);

  for (const item of items) {
    const nameCol = ITEM_COLUMNS[2];
    const nameHeight = doc.font("regular").fontSize(9).heightOfString(item.name, { width: nameCol.width - 6 });
    const rowH = Math.max(20, nameHeight + 8);

    if (y + rowH > PAGE_HEIGHT - MARGIN) {
      doc.addPage();
      y = drawTableHeader(doc, MARGIN);
    }

    const cells = [
      String(item.idx),
      item.pcode || "—",
      item.name,
      `${item.quantity} шт`,
      item.price.toFixed(2),
      item.sum.toFixed(2),
    ];

    let cx = MARGIN;
    doc.font("regular").fontSize(9).fillColor("#000000");
    cells.forEach((text, i) => {
      const col = ITEM_COLUMNS[i];
      doc.text(text, cx + 3, y + 5, { width: col.width - 6, align: col.align });
      cx += col.width;
    });

    cx = MARGIN;
    for (const col of ITEM_COLUMNS) {
      doc.moveTo(cx, y).lineTo(cx, y + rowH).stroke();
      cx += col.width;
    }
    doc.moveTo(cx, y).lineTo(cx, y + rowH).stroke();
    doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_WIDTH, y + rowH).stroke();

    y += rowH;
  }

  return y + 10;
}

function drawTotals(doc: PDFKit.PDFDocument, y: number, orderTotal: number): number {
  y = ensureSpace(doc, y, 60);
  const rows: [string, string][] = [
    ["Разом без ПДВ:", orderTotal.toFixed(2)],
    ["ПДВ:", "0.00"],
    ["Всього із ПДВ:", orderTotal.toFixed(2)],
  ];
  doc.font("regular").fontSize(10);
  for (const [label, value] of rows) {
    doc.text(label, MARGIN, y, { width: CONTENT_WIDTH - 80, align: "right" });
    doc.font("bold").text(value, MARGIN + CONTENT_WIDTH - 80, y, { width: 80, align: "right" });
    doc.font("regular");
    y += 16;
  }
  return y + 6;
}

export async function renderInvoicePdf(doc: OrderDocumentData): Promise<Buffer> {
  const { order, items, orderTotal, docNumber, dateStr, supplierLines, recipientLines, amountWords } = doc;
  const pdf = newDoc();

  let y = MARGIN;
  y = drawLabelBlock(pdf, y, "Постачальник:", supplierLines);
  y = drawLabelBlock(pdf, y, "Одержувач:", recipientLines || "—");
  y = drawLabelBlock(pdf, y, "Платник:", "той самий");
  y = drawLabelBlock(pdf, y, "Замовлення:", `Замовлення №${order.id}`);

  y += 6;
  pdf.font("bold").fontSize(15).text(`Рахунок-фактура №${docNumber}`, MARGIN, y, { width: CONTENT_WIDTH, align: "center" });
  y += 20;
  pdf.font("bold").fontSize(12).text(`від ${dateStr}`, MARGIN, y, { width: CONTENT_WIDTH, align: "center" });
  y += 24;

  y = drawItemsTable(pdf, y, items);
  y = drawTotals(pdf, y, orderTotal);

  y = ensureSpace(pdf, y, 60);
  pdf.font("regular").fontSize(10).text("Всього на суму:", MARGIN, y);
  y += 14;
  pdf.font("bold").text(amountWords, MARGIN, y, { width: CONTENT_WIDTH });
  y += 16;
  pdf.font("regular").text("ПДВ: 0.00 грн.", MARGIN, y);
  y += 30;

  y = ensureSpace(pdf, y, 30);
  pdf.text("Виписав(ла) ____________________________", MARGIN, y, { width: CONTENT_WIDTH, align: "right" });
  y += 24;

  y = ensureSpace(pdf, y, 20);
  pdf.font("regular").fontSize(8).fillColor("#555555")
    .text("Рахунок дійсний до сплати протягом трьох банківських днів.", MARGIN, y, { width: CONTENT_WIDTH, align: "right" });

  return toBuffer(pdf);
}

export async function renderWaybillPdf(doc: OrderDocumentData): Promise<Buffer> {
  const { items, orderTotal, docNumber, dateStr, supplierLines, recipientLines, amountWords } = doc;
  const pdf = newDoc();

  let y = MARGIN;
  pdf.font("bold").fontSize(15).text(`Видаткова накладна №${docNumber}`, MARGIN, y, { width: CONTENT_WIDTH, align: "center" });
  y += 20;
  pdf.font("bold").fontSize(12).text(`від ${dateStr}`, MARGIN, y, { width: CONTENT_WIDTH, align: "center" });
  y += 24;

  y = drawLabelBlock(pdf, y, "Постачальник:", supplierLines);
  y = drawLabelBlock(pdf, y, "Покупець:", recipientLines || "—");
  y += 6;

  y = drawItemsTable(pdf, y, items);
  y = drawTotals(pdf, y, orderTotal);

  y = ensureSpace(pdf, y, 20);
  pdf.font("regular").fontSize(10).text(`Всього найменувань: ${items.length} на суму ${orderTotal.toFixed(2)} грн.`, MARGIN, y, { width: CONTENT_WIDTH });
  y += 20;

  y = ensureSpace(pdf, y, 40);
  pdf.font("bold").text(amountWords, MARGIN, y, { width: CONTENT_WIDTH });
  y += 16;
  pdf.font("regular").text("У т.ч. ПДВ: нуль гривень, 00 коп.", MARGIN, y, { width: CONTENT_WIDTH });
  y += 40;

  y = ensureSpace(pdf, y, 30);
  const colW = CONTENT_WIDTH / 2;
  pdf.text("Від постачальника ____________________", MARGIN, y, { width: colW });
  pdf.text("Отримав(ла) ____________________", MARGIN + colW, y, { width: colW });

  return toBuffer(pdf);
}
