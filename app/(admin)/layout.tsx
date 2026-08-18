import { Sidebar } from "@/components/admin/sidebar";
import { supabaseServer } from "@/lib/supabase";
import { unstable_cache } from "next/cache";

// This layout wraps every single admin page — the sidebar category fetch
// below ran on every navigation click anywhere in the CRM, not just once,
// since force-dynamic here made even nested pages with their own caching
// re-render this layout from scratch. Categories change rarely (an admin
// editing the catalog tree), so a few minutes of staleness here is
// unnoticeable but removes a query from every single click.
const getSidebarCategories = unstable_cache(
  async () => {
    const { data: allCats } = await supabaseServer
      .from("categories")
      .select("id, translation_id, title, pid")
      .eq("lang", "uk")
      .order("priority", { ascending: true });
    return allCats || [];
  },
  ["admin-sidebar-categories"],
  { revalidate: 300 }
);

// Sidebar badge counts (Замовлення: нові + очікують відправку; Повернення:
// нові/неопрацьовані) — scoped to the last 7 days per the ask ("бери лише
// за останній тиждень"), same short-cache treatment as the categories
// above since this layout re-renders on every admin navigation. The "new
// order" status match mirrors app/api/orders/route.ts's own "new" quick
// filter exactly (kept as the same literal .or() string on purpose, not
// re-derived, so the sidebar count and the "Нові" list filter never
// silently drift apart from each other).
const getSidebarCounts = unstable_cache(
  async () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [newOrders, awaitingShipment, newReturns] = await Promise.all([
      supabaseServer
        .from("orders")
        .select("id", { count: "exact", head: true })
        .gte("date", weekAgo)
        .or("status.is.null,status.ilike.new,status.ilike.*нов*,status.ilike.*отримано*,status.ilike.*получен*"),
      supabaseServer
        .from("orders")
        .select("id", { count: "exact", head: true })
        .gte("date", weekAgo)
        .ilike("status", "%оплач%"),
      supabaseServer
        .from("orders_returns")
        .select("id", { count: "exact", head: true })
        .gte("date", weekAgo)
        .or("status.is.null,status.eq.Нове"),
    ]);

    return {
      newOrders: newOrders.count ?? 0,
      awaitingShipment: awaitingShipment.count ?? 0,
      newReturns: newReturns.count ?? 0,
    };
  },
  ["admin-sidebar-counts"],
  // `tags` lets every place that actually changes an order/return status
  // (see app/api/orders/[id]/{process,confirm-payment,ttn/*}, the returns
  // routes, the inventory-sync webhook, and the TTN-status cron) call
  // revalidateTag("sidebar-counts", { expire: 0 }) right after the write,
  // so the badge is correct on the very next navigation instead of up to
  // `revalidate` seconds stale. `{ expire: 0 }` (immediate) is used
  // instead of the "max" stale-while-revalidate profile precisely because
  // "one visit behind" is the exact staleness this was added to fix. The
  // 120s `revalidate` below stays as a fallback for any future write path
  // that forgets to invalidate.
  { revalidate: 120, tags: ["sidebar-counts"] }
);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Fetch all UK categories for the sidebar tree (roots + up to 2 more levels)
  const [cats, counts] = await Promise.all([getSidebarCategories(), getSidebarCounts()]);
  const roots = cats.filter((c: any) => c.pid === 0);

  const catalogRoots = roots.map((root: any) => ({
    id: root.translation_id,
    title: root.title,
    children: cats
      .filter((c: any) => c.pid === root.translation_id)
      .map((c: any) => ({ id: c.translation_id, title: c.title })),
  }));

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg)",
      }}
    >
      <Sidebar catalogRoots={catalogRoots} counts={counts} />
      {/* marginLeft is a Tailwind class, not inline style, on purpose — the
          sidebar is an off-canvas drawer below `lg` (see Sidebar's own
          comment) and must not have layout space reserved for it there,
          only from `lg` up where it's back to pushing content over. */}
      <main
        className="ml-0 lg:ml-[248px]"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
        }}
      >
        {children}
      </main>
    </div>
  );
}
