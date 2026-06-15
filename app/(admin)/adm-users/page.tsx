"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function AdmUsersPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [users, setUsers] = useState<any[]>([]);
  const [newLogin, setNewLogin] = useState("");
  const [newPass, setNewPass] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    apiFetch<any[]>("/api/adm-users").then((data) => { if (data) setUsers(data); });
  }, []);

  async function addUser() {
    if (!newLogin.trim() || !newPass.trim()) return;
    setAdding(true);
    const res = await fetch("/api/adm-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: newLogin, password: newPass }),
    });
    const created = await res.json();
    if (res.ok) {
      setUsers((prev) => [...prev, created]);
      setNewLogin("");
      setNewPass("");
      toast.success("Адміністратора створено!");
    } else {
      toast.error(created.error ?? "Помилка");
    }
    setAdding(false);
  }

  async function deleteUser(id: number) {
    if (!confirm("Видалити адміністратора?")) return;
    await fetch(`/api/adm-users/${id}`, { method: "DELETE" });
    setUsers((prev) => prev.filter((u) => u.id !== id));
    toast.success("Видалено!");
  }

  async function resetPassword(id: number) {
    const pass = prompt("Новий пароль:");
    if (!pass) return;
    await fetch(`/api/adm-users/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pass }) });
    toast.success("Пароль змінено!");
  }

  return (
    <>
      <Header title="Адміністратори" />
      <div className="p-6 max-w-2xl space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">Новий адміністратор</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Логін</Label>
                <Input value={newLogin} onChange={(e) => setNewLogin(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Пароль</Label>
                <Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
              </div>
            </div>
            <Button onClick={addUser} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Додати
            </Button>
          </CardContent>
        </Card>

        <div className="rounded-md border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Логін</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Статус</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Дії</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{u.id}</td>
                  <td className="px-4 py-2.5 font-medium">{u.login}</td>
                  <td className="px-4 py-2.5">
                    {u.status === 1 ? <Badge variant="success">Активний</Badge> : <Badge variant="secondary">Заблокований</Badge>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => resetPassword(u.id)}>Змінити пароль</Button>
                      <button onClick={() => deleteUser(u.id)} className="text-red-400 hover:text-red-600 px-2">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
