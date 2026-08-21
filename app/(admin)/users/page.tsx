import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { Users, ShoppingCart } from "lucide-react";
import { UsersTable } from "./users-table";
import { unstable_cache } from "next/cache";

// UsersTable (client component) calls useSearchParams() for the tab state,
// which Next requires a Suspense boundary for during static generation —
// force-dynamic is what already exempted this route from that (has been
// true since before this file's caching was added), not something to
// unpick here. unstable_cache below is what actually removes the repeated
// full-table fetch; it works the same regardless of this route's own
// dynamic/static rendering mode.
export const dynamic = "force-dynamic";

const PAGE = 1000;

async function fetchAllUsers() {
  const rows: any[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabaseServer
      .from("users")
      .select("id, login, person, phone, rank, addr_delivery, password")
      .order("id", { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) { console.error("[users] fetch error:", error.message); break; }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    page++;
  }
  // `password` is only ever a real hash or the "SUPABASE_AUTH" migration
  // marker (see UsersTable's classic/premium split) — never displayed, so it
  // has no reason to leave the server. Collapsed to a boolean here instead
  // of shipping the raw value down to the browser as page props.
  return rows.map(({ password, ...u }) => ({ ...u, isPremium: password === "SUPABASE_AUTH" }));
}

// This page previously paginated through the ENTIRE users table (including
// the password column, unnecessarily — see fetchAllUsers above) on every
// single force-dynamic visit. Wrapped in unstable_cache — the customer list
// doesn't need to be second-by-second fresh, so repeat visits within the
// window reuse the cached result instead of re-fetching the whole table.
const getUsersPageData = unstable_cache(
  async () => {
    const [{ count: totalUsers }, { count: totalOrders }] = await Promise.all([
      supabaseServer.from("users").select("*", { count: "exact", head: true }),
      supabaseServer.from("orders").select("*", { count: "exact", head: true }),
    ]);

    /* Full user list via pagination + per-customer order counts from the
       user_order_counts view (scripts/create-user-order-counts-view.sql) —
       one row per distinct login instead of paginating through every order
       row just to count them client-side. */
    const [allUsers, orderCountRows] = await Promise.all([
      fetchAllUsers(),
      supabaseServer.from("user_order_counts").select("login, order_count").then((r) => r.data ?? []),
    ]);

    return { totalUsers: totalUsers ?? 0, totalOrders: totalOrders ?? 0, allUsers, orderCountRows };
  },
  ["users-page"],
  { revalidate: 180 }
);

export default async function UsersPage() {
  const { totalUsers, totalOrders, allUsers, orderCountRows } = await getUsersPageData();

  const orderCountMap: Record<string, number> = Object.fromEntries(
    orderCountRows.map((r: any) => [r.login, r.order_count])
  );

  const avgOrders = allUsers.length
    ? ((totalOrders ?? 0) / allUsers.length).toFixed(1)
    : "—";

  return (
    <>
      <Header
        title="Клієнти"
        subtitle={`${(totalUsers ?? 0).toLocaleString("uk-UA")} зареєстровано`}
      />

      <div className="page-content p-4 md:p-[24px_28px]" style={{ flex: 1 }}>
        {/* Summary — fixed column counts (1/3), not auto-fill/minmax: for
            exactly 3 cards, auto-fill can pack 2 on one row and strand the
            3rd alone at some widths. 1 or 3 always divides evenly. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
          <div className="crm-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#8b5cf6,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Users size={16} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Клієнтів</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
                  {(totalUsers ?? 0).toLocaleString("uk-UA")}
                </div>
              </div>
            </div>
          </div>

          <div className="crm-card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#10b981,#059669)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ShoppingCart size={16} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Замовлень всього</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
                  {(totalOrders ?? 0).toLocaleString("uk-UA")}
                </div>
              </div>
            </div>
          </div>

          <div className="crm-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Ср. замовлень / клієнт</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{avgOrders}</div>
          </div>
        </div>

        {/* Table */}
        {allUsers.length === 0 ? (
          <div className="crm-card" style={{ padding: "64px 24px", textAlign: "center" }}>
            <Users size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px" }} />
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Клієнтів ще немає</p>
          </div>
        ) : (
          <UsersTable users={allUsers} orderCountMap={orderCountMap} />
        )}
      </div>
    </>
  );
}
