"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Zap, Crown } from "lucide-react";
import { Pagination } from "@/components/admin/data-table-controls";

const PAGE_SIZE = 40;

type User = {
  id: number;
  login: string;
  person: string | null;
  phone: string | null;
  rank: number | null;
  addr_delivery: string | null;
  isPremium: boolean;
};

interface UsersTableProps {
  users: User[];
  orderCountMap: Record<string, number>;
}

type Tab = "classic" | "premium";

const TAB_CONFIG: Record<Tab, { label: string; icon: React.ReactNode; color: string; gradient: string }> = {
  classic: {
    label: "Zipper Classic",
    icon: <Zap size={14} />,
    color: "#2563eb",
    gradient: "linear-gradient(135deg,#2563eb,#1d4ed8)",
  },
  premium: {
    label: "Zipper Premium",
    icon: <Crown size={14} />,
    color: "#d97706",
    gradient: "linear-gradient(135deg,#f59e0b,#d97706)",
  },
};

function UserRow({ u, cnt }: { u: User; cnt: number }) {
  return (
    <tr key={u.id}>
      <td style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>#{u.id}</td>
      <td style={{ fontWeight: 600 }}>{u.login}</td>
      <td>{u.person ?? "—"}</td>
      <td style={{ color: "var(--text-muted)" }}>{u.phone ?? "—"}</td>
      <td
        style={{
          color: "var(--text-muted)",
          fontSize: 12.5,
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {u.addr_delivery ?? "—"}
      </td>
      <td style={{ textAlign: "right" }}>
        <span className={cnt > 0 ? "badge badge-blue" : "badge badge-gray"}>{cnt}</span>
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        {u.rank ? (
          <span className="badge badge-purple">Ранг {u.rank}</span>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        )}
      </td>
    </tr>
  );
}

export function UsersTable({ users, orderCountMap }: UsersTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTab: Tab = searchParams.get("tab") === "premium" ? "premium" : "classic";
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  function switchTab(tab: Tab) {
    setQuery("");
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  }

  const classicUsers = users.filter((u) => !u.isPremium);
  const premiumUsers = users.filter((u) => u.isPremium);

  const pool = activeTab === "classic" ? classicUsers : premiumUsers;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? pool.filter(
        (u) =>
          u.login?.toLowerCase().includes(q) ||
          u.person?.toLowerCase().includes(q) ||
          u.phone?.toLowerCase().includes(q) ||
          u.addr_delivery?.toLowerCase().includes(q)
      )
    : pool;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const cfg = TAB_CONFIG[activeTab];

  return (
    <div className="crm-card">
      {/* Tabs — each button was a fixed padding/font size sized for its
          full "Zipper Classic"/"Zipper Premium" label, which didn't leave
          room for both side by side on a phone. Below `sm` each takes an
          equal half of the row (flex-1) at a smaller size instead of
          overflowing; `sm:` restores the exact original sizing. */}
      <div
        className="flex gap-1 sm:gap-1 items-center"
        style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}
      >
        {(Object.entries(TAB_CONFIG) as [Tab, typeof TAB_CONFIG[Tab]][]).map(([key, tab]) => {
          const count = key === "classic" ? classicUsers.length : premiumUsers.length;
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => switchTab(key)}
              className="flex-1 sm:flex-initial min-w-0 flex items-center justify-center sm:justify-start gap-1.5 sm:gap-1.5 rounded-lg px-2 sm:px-3.5 py-1.5 sm:py-[7px] text-[12px] sm:text-[13px]"
              style={{
                border: isActive ? "none" : "1px solid var(--border)",
                background: isActive ? tab.gradient : "transparent",
                color: isActive ? "#fff" : "var(--text-muted)",
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab.icon}
              <span className="truncate min-w-0">{tab.label}</span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "1px 7px",
                  borderRadius: 20,
                  background: isActive ? "rgba(255,255,255,0.25)" : "var(--bg-muted, #f3f4f6)",
                  color: isActive ? "#fff" : "var(--text-muted)",
                  minWidth: 28,
                  textAlign: "center",
                  flexShrink: 0,
                }}
              >
                {count.toLocaleString("uk-UA")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ position: "relative", maxWidth: 340 }}>
          <Search
            size={15}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder={`Пошук у ${cfg.label}...`}
            style={{
              width: "100%",
              paddingLeft: 32,
              paddingRight: 12,
              paddingTop: 7,
              paddingBottom: 7,
              fontSize: 13,
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-input, var(--bg))",
              color: "var(--text)",
              outline: "none",
            }}
          />
        </div>
        {q && (
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>
            Знайдено: {filtered.length} з {pool.length}
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
          {q ? "Нічого не знайдено" : "Немає клієнтів"}
        </div>
      ) : (
        <>
          {/* ── Mobile cards (< md) ────────────────────────────────────── */}
          {/* display:flex lives on the inner div, not here — an inline
              style="display:..." on the same element as md:hidden always
              wins over that class's @media rule, which silently showed
              these cards on desktop too, stacked above the real table. */}
          <div className="md:hidden">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
            {pageSlice.map((u) => {
              const cnt = orderCountMap[u.login] ?? 0;
              return (
                <div key={u.id} className="crm-card" style={{ padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      {/* Logins are often full emails with no spaces to
                          wrap at — without overflowWrap this text just
                          bled straight through the "N замовл." badge next
                          to it instead of respecting its own flex box. */}
                      <div style={{ fontWeight: 600, fontSize: 14, overflowWrap: "break-word" }}>{u.login}</div>
                      <div className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>#{u.id}</div>
                    </div>
                    <span className={cnt > 0 ? "badge badge-blue" : "badge badge-gray"} style={{ flexShrink: 0 }}>
                      {cnt} замовл.
                    </span>
                  </div>
                  {u.person && (
                    <div style={{ fontSize: 13, marginTop: 6 }}>{u.person}</div>
                  )}
                  {u.phone && (
                    <a
                      href={`tel:${u.phone}`}
                      style={{ display: "block", fontSize: 13, color: "var(--accent)", textDecoration: "none", fontFamily: "monospace", marginTop: 4 }}
                    >
                      {u.phone}
                    </a>
                  )}
                  {u.addr_delivery && (
                    <div
                      style={{
                        fontSize: 12, color: "var(--text-muted)", marginTop: 4,
                        overflow: "hidden", textOverflow: "ellipsis",
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}
                    >
                      {u.addr_delivery}
                    </div>
                  )}
                  {u.rank && (
                    <span className="badge badge-purple" style={{ marginTop: 8, display: "inline-block" }}>
                      Ранг {u.rank}
                    </span>
                  )}
                </div>
              );
            })}
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
          </div>

          {/* ── Desktop table (>= md) ─────────────────────────────────── */}
          <div className="hidden md:block" style={{ overflowX: "auto" }}>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Логін</th>
                  <th>Ім&apos;я</th>
                  <th>Телефон</th>
                  <th>Адреса</th>
                  <th style={{ textAlign: "right", width: 100 }}>Замовлень</th>
                  <th style={{ width: 160 }}>Ранг</th>
                </tr>
              </thead>
              <tbody>
                {pageSlice.map((u) => (
                  <UserRow key={u.id} u={u} cnt={orderCountMap[u.login] ?? 0} />
                ))}
              </tbody>
            </table>
            <div style={{ padding: "4px 16px 16px" }}>
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
