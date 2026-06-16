"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/admin/header";
import { Warehouse, Plus, Pencil, Trash2, CheckCircle, XCircle, Save, X } from "lucide-react";
import { toast } from "sonner";

interface WarehouseRow {
  id: number;
  title: string;
  address?: string;
  priority: number;
  active: number;
}

const emptyForm = { title: "", address: "", priority: 0, active: 1 };

export default function WarehousesPage() {
  const [rows, setRows] = useState<WarehouseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/warehouses");
    const data = await res.json();
    setRows(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function startEdit(row: WarehouseRow) {
    setEditId(row.id);
    setForm({ title: row.title, address: row.address || "", priority: row.priority, active: row.active });
  }

  async function saveEdit() {
    const res = await fetch(`/api/warehouses/${editId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      toast.success("Збережено");
      setEditId(null);
      load();
    } else {
      const e = await res.json();
      toast.error(e.error);
    }
  }

  async function deleteRow(id: number) {
    if (!confirm("Видалити склад?")) return;
    const res = await fetch(`/api/warehouses/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Видалено"); load(); }
    else toast.error("Помилка");
  }

  async function createWarehouse() {
    if (!newForm.title.trim()) { toast.error("Вкажіть назву"); return; }
    setCreating(true);
    const res = await fetch("/api/warehouses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newForm),
    });
    setCreating(false);
    if (res.ok) {
      toast.success("Склад створено");
      setShowCreate(false);
      setNewForm(emptyForm);
      load();
    } else {
      const e = await res.json();
      toast.error(e.error);
    }
  }

  return (
    <>
      <Header
        title="Склади"
        subtitle="Управління складськими приміщеннями"
        actions={
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Новий склад
          </button>
        }
      />

      <div className="page-content" style={{ padding: "24px 28px", flex: 1 }}>

        {/* Create form */}
        {showCreate && (
          <div
            className="crm-card animate-scale-in"
            style={{ padding: 20, marginBottom: 20 }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>
              Новий склад
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 120px", gap: 12, alignItems: "end" }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  Назва *
                </label>
                <input
                  className="crm-input"
                  placeholder="Склад 1"
                  value={newForm.title}
                  onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  Адреса
                </label>
                <input
                  className="crm-input"
                  placeholder="вул. Прикладна, 1"
                  value={newForm.address}
                  onChange={(e) => setNewForm({ ...newForm, address: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  Порядок
                </label>
                <input
                  className="crm-input"
                  type="number"
                  value={newForm.priority}
                  onChange={(e) => setNewForm({ ...newForm, priority: Number(e.target.value) })}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn-primary"
                  onClick={createWarehouse}
                  disabled={creating}
                  style={{ flex: 1 }}
                >
                  <Save size={13} /> Зберегти
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => { setShowCreate(false); setNewForm(emptyForm); }}
                  style={{ padding: "8px 10px" }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="crm-card">
          {loading ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)" }}>
              Завантаження...
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: "64px 24px", textAlign: "center" }}>
              <Warehouse size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px" }} />
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Складів ще немає</p>
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => setShowCreate(true)}>
                <Plus size={14} /> Створити перший склад
              </button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Назва</th>
                    <th>Адреса</th>
                    <th>Порядок</th>
                    <th>Статус</th>
                    <th style={{ textAlign: "right" }}>Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ color: "var(--text-muted)", fontFamily: "monospace", fontSize: 12 }}>
                        #{row.id}
                      </td>
                      <td>
                        {editId === row.id ? (
                          <input
                            className="crm-input"
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                            style={{ maxWidth: 200 }}
                          />
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: row.active ? "#10b981" : "#94a3b8",
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ fontWeight: 600 }}>{row.title}</span>
                          </div>
                        )}
                      </td>
                      <td style={{ color: "var(--text-muted)" }}>
                        {editId === row.id ? (
                          <input
                            className="crm-input"
                            value={form.address}
                            onChange={(e) => setForm({ ...form, address: e.target.value })}
                            style={{ maxWidth: 240 }}
                          />
                        ) : (
                          row.address || "—"
                        )}
                      </td>
                      <td>
                        {editId === row.id ? (
                          <input
                            className="crm-input"
                            type="number"
                            value={form.priority}
                            onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                            style={{ maxWidth: 70 }}
                          />
                        ) : (
                          row.priority
                        )}
                      </td>
                      <td>
                        {editId === row.id ? (
                          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13 }}>
                            <input
                              type="checkbox"
                              checked={form.active === 1}
                              onChange={(e) => setForm({ ...form, active: e.target.checked ? 1 : 0 })}
                            />
                            Активний
                          </label>
                        ) : (
                          <span className={`badge ${row.active ? "badge-green" : "badge-gray"}`}>
                            {row.active ? "Активний" : "Неактивний"}
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                          {editId === row.id ? (
                            <>
                              <button
                                className="btn-primary"
                                onClick={saveEdit}
                                style={{ padding: "6px 12px", fontSize: 12 }}
                              >
                                <Save size={12} /> Зберегти
                              </button>
                              <button
                                className="btn-ghost"
                                onClick={() => setEditId(null)}
                                style={{ padding: "6px 10px" }}
                              >
                                <X size={12} />
                              </button>
                            </>
                          ) : (
                            <>
                              <a
                                href={`/inventory?warehouse_id=${row.id}`}
                                className="btn-ghost"
                                style={{ padding: "6px 10px", fontSize: 12 }}
                              >
                                Залишки
                              </a>
                              <button
                                className="btn-ghost"
                                onClick={() => startEdit(row)}
                                style={{ padding: "6px 10px" }}
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                className="btn-ghost"
                                onClick={() => deleteRow(row.id)}
                                style={{ padding: "6px 10px", color: "var(--danger)" }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
