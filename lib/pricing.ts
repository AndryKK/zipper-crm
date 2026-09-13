import { supabaseServer } from "@/lib/supabase";

// products.price is stored raw (same USD-equivalent unit the legacy PHP
// storefront uses — see includes/functions.php's usdrate_uah()); the грн
// row of the `currency` table is what actually converts it to hryvnia.
export async function getUahRate(): Promise<number> {
  const { data } = await supabaseServer
    .from("currency")
    .select("rate")
    .eq("title", "грн")
    .eq("enabled", 1)
    .limit(1)
    .maybeSingle();
  return data?.rate ?? 1;
}

// Matches the legacy storefront's own checkout discount: users.rank links
// to users_categories.translation_id (both 1-4: Незареєстрований/
// Зареєстрований/Постійний/VIP), whose discount column is the % actually
// applied — confirmed live against real orders (e.g. price_base=36.75,
// price=34.91 is exactly a 5% "Зареєстрований клієнт" discount). Falls
// back to 5% (the "usually 5%" default) for logged-out/unknown clients.
const DEFAULT_DISCOUNT_PERCENT = 5;

export async function getClientDiscountPercent(login: string | null | undefined): Promise<number> {
  if (!login) return DEFAULT_DISCOUNT_PERCENT;
  const { data: user } = await supabaseServer.from("users").select("rank").eq("login", login).maybeSingle();
  if (!user?.rank) return DEFAULT_DISCOUNT_PERCENT;
  const { data: category } = await supabaseServer
    .from("users_categories")
    .select("discount")
    .eq("translation_id", user.rank)
    .eq("lang", "uk")
    .maybeSingle();
  return category?.discount ?? DEFAULT_DISCOUNT_PERCENT;
}

// order.discount_percent is a manager override (set from the stock-check
// popup or the "resend with new discount" action) — null means "use the
// client's own rank discount automatically".
export async function resolveOrderDiscountPercent(order: { login: string | null; discount_percent: number | null }): Promise<number> {
  if (order.discount_percent != null) return order.discount_percent;
  return getClientDiscountPercent(order.login);
}

// priceBase = converted grn price before the client discount; price = what
// they actually pay. Rounding matches every existing price_base/price pair
// found in real orders (round-half-up to 2dp at each step).
//
// saleRawPrice — products.price_sale, passed only when the product is
// flagged "on sale" (products.label_action == 1). The legacy storefront's
// product_price_prod()/product_price_prod_simple() (includes/functions.php)
// ALWAYS substitute price_sale for the discount-eligible price once that
// flag is set — price_base still reflects the regular `price` (or the
// price2/price3 tier, whichever rawPrice the caller passed in), but the
// price the client actually pays is `price_sale * rate * (1-discount%)`,
// not `rawPrice * rate * (1-discount%)`. Confirmed against order 20997
// (product 7969, price=1/price_sale=0.91, category discount 10% at
// qty>=100): the storefront's own checkout charged price_sale-based 49.14
// (9828 total for qty 200), but this function — before this fix — ignored
// price_sale entirely and recomputed 54.00 (10800) the moment the CRM
// reprocessed the order, silently discarding the sale price.
export function computeItemPricing(rawPrice: number, rate: number, discountPercent: number, saleRawPrice?: number | null) {
  const priceBase = Math.round(rawPrice * rate * 100) / 100;
  const clientRaw = saleRawPrice != null && saleRawPrice > 0 ? saleRawPrice : rawPrice;
  const price = Math.round(clientRaw * rate * (1 - discountPercent / 100) * 100) / 100;
  return { priceBase, price };
}

// Full storefront-equivalent pricing: mirrors cart.php's
// product_price_prod_simple_in_cart() priority exactly —
//   1. the product's category has its own bulk discount
//      (categories.discount/ndiscount, see check_discount_category_rate()
//      in includes/functions.php) and this quantity qualifies → that
//      discount REPLACES the client's own discount entirely;
//   2. otherwise, if this quantity reaches price3n or price2n, that
//      tier's OWN price (price3/price2) is used as the base, with the
//      client's normal discount still stacked on top of it;
//   3. otherwise, the plain price with the client's normal discount.
// Used wherever an order line's price needs computing/recomputing from a
// product+quantity — both were previously done with computeItemPricing()
// above, which only ever knew about the flat client discount, silently
// dropping a category/tier discount back to the flat rate the moment an
// order got processed or a manager added a line by hand.
export async function computeItemPricingForProduct(
  productId: number,
  quantity: number,
  rate: number,
  clientDiscountPercent: number
): Promise<{ priceBase: number; price: number } | null> {
  const { data: product } = await supabaseServer
    .from("products")
    .select("price, price2, price2n, price3, price3n, pid, price_sale, label_action")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return null;

  const price = Number(product.price) || 0;
  const price2 = Number(product.price2) || 0;
  const price2n = Number(product.price2n) || 0;
  const price3 = Number(product.price3) || 0;
  const price3n = Number(product.price3n) || 0;
  // See computeItemPricing's own comment — labelAction==1 means the
  // storefront charges price_sale instead of whatever base this branch
  // would otherwise use, no matter which discount branch below applies.
  const saleRaw = Number(product.label_action) === 1 && Number(product.price_sale) > 0
    ? Number(product.price_sale)
    : null;

  const { data: category } = await supabaseServer
    .from("categories")
    .select("discount, ndiscount")
    .eq("translation_id", product.pid)
    .eq("lang", "uk")
    .gt("discount", 0)
    .gt("ndiscount", 0)
    .maybeSingle();

  if (category && quantity >= category.ndiscount) {
    return computeItemPricing(price, rate, category.discount, saleRaw);
  }

  if (quantity >= price2n) {
    if (price3 > 0 && quantity >= price3n) {
      return computeItemPricing(price3, rate, clientDiscountPercent, saleRaw);
    }
    if (price2 > 0 && quantity >= price2n) {
      return computeItemPricing(price2, rate, clientDiscountPercent, saleRaw);
    }
  }

  return computeItemPricing(price, rate, clientDiscountPercent, saleRaw);
}

// Ignores any category/quantity bulk-discount rule entirely and applies
// discountPercent straight to the product's own raw price — the explicit,
// deliberate override for app/api/orders/[id]/process/route.ts's
// forceDiscountPercent, used ONLY when a manager actually typed a value
// into "Знижка клієнта, %" themselves (see discountTouched in
// orders/[id]/page.tsx). Mirrors how a manually-typed item price
// (price_manual) already overrides everything at the single-line level —
// this is the same idea at the whole-order-field level. Never used for
// the default/automatic recompute path; that one stays on
// computeItemPricingForProduct so a real category discount is never
// silently thrown away just because the field happened to have some
// value in it (see that function's own history in the comment above).
export async function computeFlatItemPricing(
  productId: number,
  rate: number,
  discountPercent: number
): Promise<{ priceBase: number; price: number } | null> {
  const { data: product } = await supabaseServer
    .from("products").select("price, price_sale, label_action").eq("id", productId).maybeSingle();
  if (!product) return null;
  // Same price_sale substitution as computeItemPricing's own comment — an
  // on-sale product is still on sale even when a manager forces a flat %%,
  // this only skips the category/tier lookup, not the sale-price base.
  const saleRaw = Number(product.label_action) === 1 && Number(product.price_sale) > 0
    ? Number(product.price_sale)
    : null;
  return computeItemPricing(Number(product.price) || 0, rate, discountPercent, saleRaw);
}

// What the "Знижка клієнта, %" field on the stock-confirmation popup
// SHOULD show right now — not just the client's rank default, which used
// to leave that field showing a stale flat number (e.g. 5%) even after a
// manager raised an item's quantity into a category's own bulk-discount
// bracket (e.g. 20% at 1000+ units for "Бігунки"), silently contradicting
// what the invoice was actually about to charge. Mirrors
// computeItemPricingForProduct's own category lookup, but only needs the
// resulting percentage.
//
// IMPORTANT: this number isn't just displayed — app/api/orders/[id]/process's
// non-forced recompute passes it straight through to
// computeItemPricingForProduct() as `clientDiscountPercent` for EVERY active
// item. computeItemPricingForProduct only actually uses that parameter for
// items that DON'T reach their own category's threshold (an item that does
// ignores it entirely and uses its category's own discount instead) — so
// returning one item's category rate here is only safe when every other
// active item either shares that exact same category+discount or would get
// the plain client discount anyway. A genuinely mixed order (this function's
// old version returned the FIRST qualifying category found, no matter how
// many other items didn't qualify for anything) silently overcharged/
// undercharged everything else the moment "Опрацювати"/"Змінити і
// надіслати повторно" ran on it — confirmed live on order 21035: one item
// (s8448) reached its category's 10%-at-100 threshold, the other four
// didn't, and the field's borrowed "10%" got auto-applied to those four too
// on processing (correct price should've stayed each item's real 5% client
// discount — see git history for the fix and the exact numbers).
export async function resolveEffectiveDiscountForOrder(orderId: number): Promise<number> {
  const { data: order } = await supabaseServer
    .from("orders").select("login, discount_percent").eq("id", orderId).maybeSingle();
  const clientDefault = order ? await resolveOrderDiscountPercent(order) : DEFAULT_DISCOUNT_PERCENT;

  const { data: items } = await supabaseServer
    .from("orders_item").select("product, quantity").eq("oid", orderId).eq("active", true);
  if (!items?.length) return clientDefault;

  const productIds = [...new Set(items.map((i) => i.product))];
  const { data: products } = await supabaseServer.from("products").select("id, pid").in("id", productIds);
  const pidByProduct = new Map((products ?? []).map((p) => [p.id, p.pid as number]));

  const categoryTrIds = [...new Set([...pidByProduct.values()])];
  const { data: categories } = categoryTrIds.length
    ? await supabaseServer
        .from("categories").select("translation_id, discount, ndiscount").in("translation_id", categoryTrIds)
        .eq("lang", "uk").gt("discount", 0).gt("ndiscount", 0)
    : { data: [] };
  const categoryByTrId = new Map((categories ?? []).map((c) => [c.translation_id, c]));

  // Only worth showing/using a category's bulk discount as THE order-wide
  // value when literally every active item qualifies for that exact same
  // category discount — anything else falls back to the plain client
  // default, which computeItemPricingForProduct's own per-item category
  // check will still correctly override for whichever item actually
  // qualifies, regardless of what's returned here.
  let uniform: number | null = null;
  for (const item of items) {
    const pid = pidByProduct.get(item.product);
    const category = pid != null ? categoryByTrId.get(pid) : undefined;
    if (!category || item.quantity < category.ndiscount) return clientDefault;
    if (uniform == null) uniform = category.discount;
    else if (uniform !== category.discount) return clientDefault;
  }
  return uniform ?? clientDefault;
}
