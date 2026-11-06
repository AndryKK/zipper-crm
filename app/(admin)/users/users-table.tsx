"use client";

import { useState } from "react";
import { Search, KeyRound, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Pagination } from "@/components/admin/data-table-controls";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PAGE_SIZE = 40;

type User = {
  id: number;
  login: string;
  person: string | null;
  phone: string | null;
  rank: number | null;
  addr_delivery: string | null;
};

interface UsersTableProps {
  users: User[];
  orderCountMap: Record<string, number>;
}

function UserRow({ u, cnt, resettingId, onReset }: { u: User; cnt: number; resettingId: number | null; onReset: (u: User) => void }) {
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
      <td style={{ whiteSpace: "nowrap" }}>
        <button
          className="btn-ghost"
          onClick={() => onReset(u)}
          disabled={resettingId === u.id}
          style={{ padding: "5px 10px", fontSize: 12 }}
        >
          {resettingId === u.id ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />} Змінити пароль
        </button>
      </td>
    </tr>
  );
}

export function UsersTable({ users, orderCountMap }: UsersTableProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // ── "Змінити пароль" ────────────────────────────────────────────────
  // A customer's real password can never be shown (bcrypt-hashed, one-
  // way) — this generates a fresh one server-side and shows it here ONCE,
  // for the admin to relay to the client themselves. Nothing re-fetches
  // or re-displays it after this dialog closes; the plaintext only ever
  // exists for the lifetime of this one response/view.
  const [confirmResetUser, setConfirmResetUser] = useState<User | null>(null);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [newPasswordResult, setNewPasswordResult] = useState<{ login: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function doResetPassword(u: User) {
    setResettingId(u.id);
    try {
      const res = await fetch(`/api/users/${u.id}/reset-password`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Не вдалося згенерувати пароль"); return; }
      setNewPasswordResult({ login: u.login, password: data.password });
    } catch {
      toast.error("Помилка з'єднання");
    } finally {
      setResettingId(null);
    }
  }

  async function copyNewPassword() {
    if (!newPasswordResult) return;
    try {
      await navigator.clipboard.writeText(newPasswordResult.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Не вдалося скопіювати");
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? users.filter(
        (u) =>
          u.login?.toLowerCase().includes(q) ||
          u.person?.toLowerCase().includes(q) ||
          u.phone?.toLowerCase().includes(q) ||
          u.addr_delivery?.toLowerCase().includes(q)
      )
    : users;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
    <div className="crm-card">
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
            placeholder="Пошук клієнтів..."
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
            Знайдено: {filtered.length} з {users.length}
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
                  <button
                    className="btn-ghost"
                    onClick={() => setConfirmResetUser(u)}
                    disabled={resettingId === u.id}
                    style={{ marginTop: 10, width: "100%", justifyContent: "center", padding: "8px 10px", fontSize: 12.5 }}
                  >
                    {resettingId === u.id ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Змінити пароль
                  </button>
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
                  <th style={{ width: 160 }}>Дії</th>
                </tr>
              </thead>
              <tbody>
                {pageSlice.map((u) => (
                  <UserRow
                    key={u.id}
                    u={u}
                    cnt={orderCountMap[u.login] ?? 0}
                    resettingId={resettingId}
                    onReset={setConfirmResetUser}
                  />
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

    {/* ── Confirm step — a reset invalidates the client's current
        password immediately, so this isn't a one-click action. ── */}
    {confirmResetUser && (
      <ConfirmDialog
        message={`Згенерувати новий пароль для ${confirmResetUser.login}?`}
        subMessage="Поточний пароль клієнта одразу перестане працювати. Новий пароль покажеться один раз — скопіюйте й передайте його клієнту самостійно (лист на email не надсилається)."
        confirmLabel="Згенерувати"
        onConfirm={() => doResetPassword(confirmResetUser)}
        onCancel={() => setConfirmResetUser(null)}
      />
    )}

    {/* ── One-time reveal — nothing re-fetches or re-shows this password
        after the dialog closes; this is the only place it's ever visible. ── */}
    <Dialog open={!!newPasswordResult} onOpenChange={(open) => { if (!open) { setNewPasswordResult(null); setCopied(false); } }}>
      <DialogContent style={{ maxWidth: 420 }}>
        <DialogHeader>
          <DialogTitle>Новий пароль</DialogTitle>
        </DialogHeader>
        {newPasswordResult && (
          <>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "-4px 0 4px" }}>
              Для <strong>{newPasswordResult.login}</strong>. Збережіть або передайте клієнту зараз —
              повторно це вікно не відкриється.
            </p>
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                padding: "12px 14px", borderRadius: 8, border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
              }}
            >
              <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, letterSpacing: 0.5, color: "var(--text)" }}>
                {newPasswordResult.password}
              </span>
              <button
                onClick={copyNewPassword}
                className="btn-ghost"
                style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Скопійовано" : "Копіювати"}
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn-primary" onClick={() => { setNewPasswordResult(null); setCopied(false); }}>
                Готово
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
