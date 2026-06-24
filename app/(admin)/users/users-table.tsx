"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Zap, Crown } from "lucide-react";

type User = {
  id: number;
  login: string;
  person: string | null;
  phone: string | null;
  rank: number | null;
  addr_delivery: string | null;
  password: string | null;
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
        {cnt > 0 ? (
          <span className="badge badge-blue">{cnt}</span>
        ) : (
          <span style={{ color: "var(--text-muted)" }}>0</span>
        )}
      </td>
      <td>
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

  function switchTab(tab: Tab) {
    setQuery("");
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  }

  const classicUsers = users.filter((u) => u.password !== "SUPABASE_AUTH");
  const premiumUsers = users.filter((u) => u.password === "SUPABASE_AUTH");

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

  const cfg = TAB_CONFIG[activeTab];

  return (
    <div className="crm-card">
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          alignItems: "center",
        }}
      >
        {(Object.entries(TAB_CONFIG) as [Tab, typeof TAB_CONFIG[Tab]][]).map(([key, tab]) => {
          const count = key === "classic" ? classicUsers.length : premiumUsers.length;
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => switchTab(key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                borderRadius: 8,
                border: isActive ? "none" : "1px solid var(--border)",
                background: isActive ? tab.gradient : "transparent",
                color: isActive ? "#fff" : "var(--text-muted)",
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab.icon}
              {tab.label}
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
            onChange={(e) => setQuery(e.target.value)}
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
              {filtered.map((u) => (
                <UserRow key={u.id} u={u} cnt={orderCountMap[u.login] ?? 0} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
