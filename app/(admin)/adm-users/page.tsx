"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, RefreshCw, Copy } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ROLES, ROLE_LABELS, PROTECTED_LOGIN, type Role } from "@/lib/roles";

type AdmUser = { id: number; login: string; role: Role };

// Passwords are bcrypt-hashed one-way in the DB — nobody, including a
// superadmin, can ever look up an existing password again (that's the
// point of hashing, not a gap to fix). The only place a superadmin can
// legitimately see a password in plaintext is the moment they set it here,
// which is what this dialog is for — generate or type one, copy it, hand
// it to the person, done.
function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function AdmUsersPage() {
  const { data: session } = useSession();
  const myId = (session?.user as { id?: string } | undefined)?.id;

  const [users, setUsers] = useState<AdmUser[]>([]);
  const [newLogin, setNewLogin] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState<Role>(ROLES.WAREHOUSE_ADMIN);
  const [adding, setAdding] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [resetUser, setResetUser] = useState<AdmUser | null>(null);
  const [resetValue, setResetValue] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetch("/api/adm-users").then(async (res) => {
      if (res.ok) {
        setUsers(await res.json());
        return;
      }
      // A 403 here usually means the browser's session was signed in
      // before roles existed — the JWT has no role claim yet, so even an
      // actual superadmin gets rejected by the API's own check until they
      // log out and back in (see lib/roles.ts's isPathAllowed comment).
      const data = await res.json().catch(() => ({}));
      toast.error(res.status === 403 ? "Немає доступу — вийдіть і зайдіть в акаунт заново" : (data.error ?? "Помилка завантаження"));
    });
  }, []);

  async function addUser() {
    if (!newLogin.trim() || !newPass.trim()) return;
    setAdding(true);
    const res = await fetch("/api/adm-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: newLogin, password: newPass, role: newRole }),
    });
    const created = await res.json();
    if (res.ok) {
      setUsers((prev) => [...prev, created]);
      setNewLogin("");
      setNewPass("");
      setNewRole(ROLES.WAREHOUSE_ADMIN);
      toast.success("Адміністратора створено!");
    } else {
      toast.error(created.error ?? "Помилка");
    }
    setAdding(false);
  }

  async function deleteUser(id: number) {
    const res = await fetch(`/api/adm-users/${id}`, { method: "DELETE" });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== id));
      toast.success("Видалено!");
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Помилка");
    }
  }

  function openResetDialog(u: AdmUser) {
    setResetUser(u);
    // Left empty on purpose, not pre-filled with a generated password —
    // a value sitting in this field looks exactly like "the current
    // password" even though nothing is saved until "Змінити пароль" is
    // clicked below. An empty field can't be mistaken for an active one.
    setResetValue("");
  }

  async function copyResetValue() {
    try {
      await navigator.clipboard.writeText(resetValue);
      toast.success("Скопійовано!");
    } catch {
      toast.error("Не вдалося скопіювати");
    }
  }

  async function confirmReset() {
    if (!resetUser || !resetValue.trim()) return;
    setResetting(true);
    const res = await fetch(`/api/adm-users/${resetUser.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetValue }),
    });
    if (res.ok) {
      toast.success("Пароль змінено!");
      setResetUser(null);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Помилка");
    }
    setResetting(false);
  }

  async function changeRole(id: number, role: Role) {
    const res = await fetch(`/api/adm-users/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
      toast.success("Роль змінено!");
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Помилка");
    }
  }

  return (
    <>
      <Header title="Адміністратори" />
      <div className="p-4 md:p-6 max-w-2xl space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Новий адміністратор</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Логін</Label>
                {/* autoComplete="off" alone is routinely ignored by Chrome
                    on fields it thinks are a login form — a name the
                    browser doesn't recognize as "username" is what
                    actually stops it silently pre-filling this with the
                    already-logged-in superadmin's own saved credentials. */}
                <Input name="new-admin-login" autoComplete="off" value={newLogin} onChange={(e) => setNewLogin(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Пароль</Label>
                <Input type="password" name="new-admin-password" autoComplete="new-password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Роль</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(ROLES).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addUser} disabled={adding} className="w-full sm:w-auto">
              {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Додати
            </Button>
          </CardContent>
        </Card>

        {/* ── Mobile cards (< md) ────────────────────────────────────── */}
        <div className="md:hidden space-y-3">
          {users.map((u) => {
            const roleLocked = String(u.id) === String(myId) || u.login === PROTECTED_LOGIN;
            return (
              <div key={u.id} className="crm-card" style={{ padding: 14 }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600 }}>{u.login}</div>
                  <div className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>#{u.id}</div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  {roleLocked ? (
                    <span className="text-gray-600" style={{ fontSize: 13 }}>{ROLE_LABELS[u.role]}</span>
                  ) : (
                    <Select value={u.role} onValueChange={(v) => changeRole(u.id, v as Role)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.values(ROLES).map((r) => (
                          <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="outline" size="sm" onClick={() => openResetDialog(u)} className="flex-1">Змінити пароль</Button>
                  {!roleLocked && (
                    <button onClick={() => setDeleteId(u.id)} className="text-red-400 hover:text-red-600" style={{ padding: "0 10px", flexShrink: 0 }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Desktop table (>= md) ─────────────────────────────────── */}
        <div className="rounded-md border overflow-hidden bg-white hidden md:block">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Логін</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Роль</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Дії</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                // A superadmin can change anyone's role except their own
                // (so nobody strips their own access by accident) and
                // except the always-superadmin fallback account — see
                // lib/roles.ts's PROTECTED_LOGIN.
                const roleLocked = String(u.id) === String(myId) || u.login === PROTECTED_LOGIN;
                return (
                  <tr key={u.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{u.id}</td>
                    <td className="px-4 py-2.5 font-medium">{u.login}</td>
                    <td className="px-4 py-2.5">
                      {roleLocked ? (
                        <span className="text-gray-600">{ROLE_LABELS[u.role]}</span>
                      ) : (
                        <Select value={u.role} onValueChange={(v) => changeRole(u.id, v as Role)}>
                          <SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.values(ROLES).map((r) => (
                              <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openResetDialog(u)}>Змінити пароль</Button>
                        {!roleLocked && (
                          <button onClick={() => setDeleteId(u.id)} className="text-red-400 hover:text-red-600 px-2">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {deleteId !== null && (
        <ConfirmDialog
          message="Видалити адміністратора?"
          destructive
          confirmLabel="Видалити"
          onConfirm={() => deleteUser(deleteId)}
          onCancel={() => setDeleteId(null)}
        />
      )}

      {resetUser && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 10000,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setResetUser(null); }}
        >
          <div
            style={{
              background: "var(--bg)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "24px 28px", width: 420, maxWidth: "calc(100vw - 32px)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: "0 0 4px" }}>
              Новий пароль для {resetUser.login}
            </p>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 16px", lineHeight: 1.5 }}>
              Поточний пароль {resetUser.login} не змінився. Введіть новий пароль або натисніть «Згенерувати» — він набуде чинності лише після натискання «Змінити пароль» внизу.
            </p>
            <div className="flex gap-2 mb-5">
              <Input
                name="reset-admin-password"
                autoComplete="new-password"
                placeholder="Ще не задано"
                value={resetValue}
                onChange={(e) => setResetValue(e.target.value)}
                className="font-mono"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setResetValue(generatePassword())} title="Згенерувати новий">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={copyResetValue} disabled={!resetValue.trim()} title="Копіювати">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Button variant="outline" onClick={() => setResetUser(null)}>Скасувати</Button>
              <Button onClick={confirmReset} disabled={resetting || !resetValue.trim()}>
                {resetting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Змінити пароль
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
