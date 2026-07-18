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
  // exact row id (often a non-"uk" row) — matching by id alone (no lang
  // filter) is what actually finds the purchased product.
  const productIds = (items ?? []).map((i: { product: number }) => i.product);
  const { data: products } = productIds.length
    ? await supabaseServer.from("products").select("id, title, pcode").in("id", productIds)
    : { data: [] };

  const prodMap: Record<number, { title: string; pcode: string | null }> = {};
  for (const p of products ?? []) prodMap[p.id] = p;

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
