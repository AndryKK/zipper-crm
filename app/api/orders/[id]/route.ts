import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import { resolveLegacyReturns } from "@/lib/returns-resolve";
import { revalidateTag } from "next/cache";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: order } = await supabaseServer
    .from("orders")
    .select("*")
    .eq("id", parseInt(id))
    .single();
  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [{ data: items }, { data: returns }] = await Promise.all([
    supabaseServer.from("orders_item").select("*").eq("oid", parseInt(id)),
    // Legacy storefront returns aren't linked via `oid` at all — only via the
    // free-text `order` field — so match either, then resolve legacy rows
    // (auto-fills oid/product/qty from order/code/quantity) before returning.
    supabaseServer
      .from("orders_returns")
      .select("*")
      .or(`oid.eq.${parseInt(id)},order.eq.${parseInt(id)}`)
      .order("date", { ascending: false }),
  ]);
  const resolvedReturns = await resolveLegacyReturns(returns ?? []);

  // Products are stored per-language with each language row having its own
  // id, and orders_item.product is that exact row id — match by id alone
  // (no lang filter), same fix as the invoice/waybill product resolution.
  const productIds = [...new Set((items ?? []).map((i) => i.product))];
  const { data: products } = productIds.length
    ? await supabaseServer.from("products").select("id, title, img, pcode, uri, active, lang, translation_id").in("id", productIds)
    : { data: [] };
  const prodMap = new Map((products ?? []).map((p) => [p.id, p]));

  // MAIN_DOMAIN is the "uk" storefront (com.zipper-shop.online, see
  // lib/price-lists.ts SITE_URL.uk) — the product URL must use the "uk" row
  // of the ordered product's translation group, not necessarily the row
  // orders_item.product points at (orders can be placed against either
  // language's id). If that "uk" row is itself an inactive color variant
  // (no live page of its own), the site instead shows it on the active
  // variant's page with the ordered variant's translation_id appended
  // (/product/<active-variant-uk-uri>/<translation_id>) — same lookup the
  // old PHP admin (adm/orders.php) did via products_colors.pid -> pid_with,
  // keyed by translation_id (== id of the "ru" master row).
  const groupIds = [...new Set((products ?? []).map((p) => p.translation_id))];
  const { data: ukRows } = groupIds.length
    ? await supabaseServer.from("products").select("translation_id, uri, active").in("translation_id", groupIds).eq("lang", "uk")
    : { data: [] };
  const ukRowByGroupId = new Map((ukRows ?? []).map((p) => [p.translation_id, p]));

  const needsColorLookup = groupIds.filter((gid) => ukRowByGroupId.get(gid)?.active !== 1);
  const mainUkUriByGroupId = new Map<number, string>();
  if (needsColorLookup.length) {
    const { data: colorLinks } = await supabaseServer
      .from("products_colors")
      .select("pid, pid_with")
      .in("pid", needsColorLookup);
    const mainGroupIds = [...new Set((colorLinks ?? []).map((c) => c.pid_with))];
    if (mainGroupIds.length) {
      const { data: mainUkRows } = await supabaseServer
        .from("products")
        .select("translation_id, uri")
        .in("translation_id", mainGroupIds)
        .eq("lang", "uk");
      const mainUkRowByGroupId = new Map((mainUkRows ?? []).map((p) => [p.translation_id, p]));
      for (const { pid, pid_with } of colorLinks ?? []) {
        const mainUkRow = mainUkRowByGroupId.get(pid_with);
        if (mainUkRow) mainUkUriByGroupId.set(pid, mainUkRow.uri);
      }
    }
  }

  const itemsWithProduct = (items ?? []).map((item) => {
    const prod = prodMap.get(item.product);
    let productUrl: string | null = null;
    if (prod) {
      const groupId = prod.translation_id;
      const ukRow = ukRowByGroupId.get(groupId);
      const mainUkUri = mainUkUriByGroupId.get(groupId);
      if (ukRow?.active === 1) {
        productUrl = `${process.env.MAIN_DOMAIN}/product/${ukRow.uri}`;
      } else if (mainUkUri) {
        productUrl = `${process.env.MAIN_DOMAIN}/product/${mainUkUri}/${groupId}`;
      } else if (ukRow) {
        productUrl = `${process.env.MAIN_DOMAIN}/product/${ukRow.uri}`;
      } else if (prod.uri) {
        productUrl = `${process.env.MAIN_DOMAIN}/product/${prod.uri}`;
      }
    }
    return {
      ...item,
      productTitle: prod?.title ?? null,
      productImg: prod?.img ?? null,
      productPcode: prod?.pcode ?? null,
      productUrl,
    };
  });

  return NextResponse.json({ ...order, items: itemsWithProduct, returns: resolvedReturns });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { data: order } = await supabaseServer
    .from("orders")
    .update(body)
    .eq("id", parseInt(id))
    .select("*")
    .single();
  // This is the generic manual-edit save (the status dropdown + "Зберегти"
  // button, and advanceStatus() for "Відправлено"/"Завершено") — unlike
  // process/confirm-payment/ttn/*, it wasn't previously wired to
  // revalidateTag, so a manual status change here left the sidebar's
  // "очікують відправку" badge stuck at the old count until the 120s
  // cache fallback happened to expire.
  if (body.status !== undefined) revalidateTag("sidebar-counts", { expire: 0 });
  return NextResponse.json(order);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await supabaseServer.from("orders").delete().eq("id", parseInt(id));
  return NextResponse.json({ success: true });
}
