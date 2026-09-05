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
export function computeItemPricing(rawPrice: number, rate: number, discountPercent: number) {
  const priceBase = Math.round(rawPrice * rate * 100) / 100;
  const price = Math.round(priceBase * (1 - discountPercent / 100) * 100) / 100;
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
    .select("price, price2, price2n, price3, price3n, pid")
    .eq("id", productId)
    .maybeSingle();
  if (!product) return null;

  const price = Number(product.price) || 0;
  const price2 = Number(product.price2) || 0;
  const price2n = Number(product.price2n) || 0;
  const price3 = Number(product.price3) || 0;
  const price3n = Number(product.price3n) || 0;

  const { data: category } = await supabaseServer
    .from("categories")
    .select("discount, ndiscount")
    .eq("translation_id", product.pid)
    .eq("lang", "uk")
    .gt("discount", 0)
    .gt("ndiscount", 0)
    .maybeSingle();

  if (category && quantity >= category.ndiscount) {
    const priceBase = Math.round(price * rate * 100) / 100;
    const discounted = Math.round(priceBase * (1 - category.discount / 100) * 100) / 100;
    return { priceBase, price: discounted };
  }

  if (quantity >= price2n) {
    if (price3 > 0 && quantity >= price3n) {
      return computeItemPricing(price3, rate, clientDiscountPercent);
    }
    if (price2 > 0 && quantity >= price2n) {
      return computeItemPricing(price2, rate, clientDiscountPercent);
    }
  }

  return computeItemPricing(price, rate, clientDiscountPercent);
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
  const { data: product } = await supabaseServer.from("products").select("price").eq("id", productId).maybeSingle();
  if (!product) return null;
  return computeItemPricing(Number(product.price) || 0, rate, discountPercent);
}

// What the "Знижка клієнта, %" field on the stock-confirmation popup
// SHOULD show right now — not just the client's rank default, which used
// to leave that field showing a stale flat number (e.g. 5%) even after a
// manager raised an item's quantity into a category's own bulk-discount
// bracket (e.g. 20% at 1000+ units for "Бігунки"), silently contradicting
// what the invoice was actually about to charge. Mirrors
// computeItemPricingForProduct's own category lookup, but only needs the
// resulting percentage. An order whose active items span several
// categories with different bulk discounts is a real limitation here —
// one field can't show two numbers — so this just returns the first
// qualifying one found; same simplification the popup's single flat
// field already had to make.
export async function resolveEffectiveDiscountForOrder(orderId: number): Promise<number> {
  const { data: order } = await supabaseServer
    .from("orders").select("login, discount_percent").eq("id", orderId).maybeSingle();
  const clientDefault = order ? await resolveOrderDiscountPercent(order) : DEFAULT_DISCOUNT_PERCENT;

  const { data: items } = await supabaseServer
    .from("orders_item").select("product, quantity").eq("oid", orderId).eq("active", true);
  for (const item of items ?? []) {
    const { data: product } = await supabaseServer.from("products").select("pid").eq("id", item.product).maybeSingle();
    if (!product) continue;
    const { data: category } = await supabaseServer
      .from("categories").select("discount, ndiscount").eq("translation_id", product.pid).eq("lang", "uk")
      .gt("discount", 0).gt("ndiscount", 0).maybeSingle();
    if (category && item.quantity >= category.ndiscount) return category.discount;
  }
  return clientDefault;
}
