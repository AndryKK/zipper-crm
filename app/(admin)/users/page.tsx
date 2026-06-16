import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { Users, ShoppingCart } from "lucide-react";

export const dynamic = "force-dynamic";

const PAGE = 1000;

async function fetchAllUsers() {
  const rows: any[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabaseServer
      .from("users")
      .select("id, login, person, phone, rank, addr_delivery")
      .order("id", { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) { console.error("[users] fetch error:", error.message); break; }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    page++;
  }
  return rows;
}

async function fetchAllOrderLogins() {
  const rows: { login: string }[] = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabaseServer
      .from("orders")
      .select("login")
      .not("login", "is", null)
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error) { console.error("[orders] fetch error:", error.message); break; }
    if (!data || data.length === 0) break;
    rows.push(...(data as { login: string }[]));
    if (data.length < PAGE) break;
    page++;
  }
  return rows;
}

export default async function UsersPage() {
  /* Accurate counts — no row transfer */
  const [{ count: totalUsers }, { count: totalOrders }] = await Promise.all([
    supabaseServer.from("users").select("*", { count: "exact", head: true }),
    supabaseServer.from("orders").select("*", { count: "exact", head: true }),
  ]);

  /* Full data via pagination */
  const [allUsers, allOrderLogins] = await Promise.all([
    fetchAllUsers(),
    fetchAllOrderLogins(),
  ]);

  const orderCountMap: Record<string, number> = {};
  for (const row of allOrderLogins) {
    orderCountMap[row.login] = (orderCountMap[row.login] ?? 0) + 1;
  }

  const avgOrders = allUsers.length
    ? ((totalOrders ?? 0) / allUsers.length).toFixed(1)
    : "—";

  return (
    <>
      <Header
        title="Клієнти"
        subtitle={`${(totalUsers ?? 0).toLocaleString("uk-UA")} зареєстровано`}
      />

      <div className="page-content" style={{ padding: "24px 28px", flex: 1 }}>
        {/* Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
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
        <div className="crm-card">
          {allUsers.length === 0 ? (
            <div style={{ padding: "64px 24px", textAlign: "center" }}>
              <Users size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px" }} />
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Клієнтів ще немає</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Логін</th>
                    <th>Ім&apos;я</th>
                    <th>Телефон</th>
                    <th>Адреса</th>
                    <th style={{ textAlign: "right" }}>Замовлень</th>
                    <th>Ранг</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map((u: any) => {
                    const cnt = orderCountMap[u.login] ?? 0;
                    return (
                      <tr key={u.id}>
                        <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>#{u.id}</td>
                        <td style={{ fontWeight: 600 }}>{u.login}</td>
                        <td>{u.person ?? "—"}</td>
                        <td style={{ color: "var(--text-muted)" }}>{u.phone ?? "—"}</td>
                        <td style={{ color: "var(--text-muted)", fontSize: 12.5, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {u.addr_delivery ?? "—"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {cnt > 0
                            ? <span className="badge badge-blue">{cnt}</span>
                            : <span style={{ color: "var(--text-muted)" }}>0</span>}
                        </td>
                        <td>
                          {u.rank
                            ? <span className="badge badge-purple">Ранг {u.rank}</span>
                            : <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
