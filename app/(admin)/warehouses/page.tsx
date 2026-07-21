"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/admin/header";
import {
  Warehouse, Plus, Pencil, Trash2, Save, X,
  MapPin, AlertTriangle, Boxes, Search,
} from "lucide-react";
import { toast } from "sonner";
import { InventoryHistoryDialog } from "@/components/admin/inventory-history-dialog";

/* ─── Types ─────────────────────────────────────────────────────── */
interface WarehouseStat {
  id: number; title: string; address?: string;
  priority: number; active: number;
  totalProducts: number; totalQty: number; totalMin: number;
  fillPct: number; lowStock: number;
  distribution: { full: number; medium: number; low: number; empty: number };
}
interface InventoryRow {
  id: number; product_id: number; warehouse_id: number;
  quantity: number; reserved: number; initial_quantity: number; min_quantity: number;
  product?: { id: number; title: string; pcode?: string };
}

const emptyForm = { title: "", address: "", priority: 0, active: 1 };

/* ─── Helpers ────────────────────────────────────────────────────── */
function fillColor(p: number) { return p >= 70 ? "#10b981" : p >= 30 ? "#f59e0b" : "#ef4444"; }
function fillGradient(p: number) {
  return p >= 70 ? "linear-gradient(90deg,#10b981,#059669)"
       : p >= 30 ? "linear-gradient(90deg,#f59e0b,#d97706)"
                 : "linear-gradient(90deg,#ef4444,#dc2626)";
}

/* Count-up hook */
function useCountUp(target: number, active: boolean, duration = 900) {
  const [val, setVal] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (!active) { setVal(0); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - t, 3)) * target));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, active, duration]);
  return val;
}

/* ─── Warehouse Widget ───────────────────────────────────────────── */
function WarehouseWidget({ w, onEdit, onDelete, onTabClick, animDelay }: {
  w: WarehouseStat;
  onEdit: (w: WarehouseStat) => void;
  onDelete: (id: number) => void;
  onTabClick: (id: number) => void;
  animDelay: number;
}) {
  const [ready, setReady] = useState(false);
  const color = fillColor(w.fillPct);
  const gradient = fillGradient(w.fillPct);
  const displayPct = useCountUp(w.fillPct, ready);
  const total = w.distribution.full + w.distribution.medium + w.distribution.low + w.distribution.empty;

  useEffect(() => {
    const t = setTimeout(() => setReady(true), animDelay);
    return () => clearTimeout(t);
  }, [animDelay]);

  return (
    <div
      className="crm-card"
      style={{ padding: 0, overflow: "hidden", cursor: "pointer", transition: "transform 0.28s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.28s ease" }}
      onClick={() => onTabClick(w.id)}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 14px 44px rgba(0,0,0,0.14)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = ""; }}
    >
      <div style={{ height: 5, background: gradient }} />
      <div style={{ padding: "22px 28px 24px" }}>

        {/* Row 1: icon + name + status + % + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Warehouse size={22} color={color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{w.title}</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20, background: w.active ? "rgba(16,185,129,0.12)" : "rgba(148,163,184,0.15)", color: w.active ? "#059669" : "var(--text-muted)" }}>
                {w.active ? "Активний" : "Неактивний"}
              </span>
            </div>
            {w.address && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                <MapPin size={12} color="var(--text-muted)" />
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{w.address}</span>
              </div>
            )}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, minWidth: 80 }}>
            <div style={{ fontSize: 42, fontWeight: 900, color, lineHeight: 1, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>
              {displayPct}%
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>наповнення</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }} onClick={(e) => e.stopPropagation()}>
            <button className="btn-ghost" onClick={() => onEdit(w)} style={{ padding: "8px 12px" }} title="Редагувати"><Pencil size={14} /></button>
            <button className="btn-ghost" onClick={() => onDelete(w.id)} style={{ padding: "8px 12px", color: "var(--danger)" }} title="Видалити"><Trash2 size={14} /></button>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ height: 12, background: "var(--border)", borderRadius: 8, overflow: "hidden", position: "relative" }}>
            {[25, 50, 75].map((t) => (
              <div key={t} style={{ position: "absolute", left: `${t}%`, top: 0, width: 1, height: "100%", background: "rgba(255,255,255,0.4)", zIndex: 2 }} />
            ))}
            <div style={{ height: "100%", width: `${ready ? w.fillPct : 0}%`, background: gradient, borderRadius: 8, transition: "width 0.9s cubic-bezier(0.34,1.56,0.64,1)", boxShadow: `0 0 10px ${color}55` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, paddingLeft: "23%", paddingRight: "23%" }}>
            {[25, 50, 75].map((t) => <span key={t} style={{ fontSize: 10, color: "var(--text-muted)" }}>{t}%</span>)}
          </div>
        </div>

        {/* Distribution */}
        {total > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", height: 6, borderRadius: 4, overflow: "hidden", gap: 2 }}>
              {w.distribution.full   > 0 && <div style={{ flex: w.distribution.full,   background: "#10b981" }} />}
              {w.distribution.medium > 0 && <div style={{ flex: w.distribution.medium, background: "#f59e0b" }} />}
              {w.distribution.low    > 0 && <div style={{ flex: w.distribution.low,    background: "#ef4444" }} />}
              {w.distribution.empty  > 0 && <div style={{ flex: w.distribution.empty,  background: "var(--border)" }} />}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
              {[
                { label: "повні ≥70%",  val: w.distribution.full,   color: "#10b981" },
                { label: "середні",     val: w.distribution.medium, color: "#f59e0b" },
                { label: "низькі <30%", val: w.distribution.low,    color: "#ef4444" },
                { label: "порожні",     val: w.distribution.empty,  color: "var(--text-muted)" },
              ].filter((d) => d.val > 0).map((d) => (
                <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}><b style={{ color: "var(--text)", fontWeight: 700 }}>{d.val}</b> {d.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats footer */}
        <div style={{ display: "flex", gap: 0, borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: total > 0 ? 0 : 18 }}>
          {[
            { value: w.totalProducts.toLocaleString("uk-UA"), label: "позицій" },
            { value: w.totalQty.toLocaleString("uk-UA"),      label: "одиниць на складі" },
            { value: String(w.lowStock),                       label: "під мінімумом", danger: w.lowStock > 0 },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", position: "relative" }}>
              {i > 0 && <div style={{ position: "absolute", left: 0, top: "10%", height: "80%", width: 1, background: "var(--border)" }} />}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                {s.danger && <AlertTriangle size={12} color="#ef4444" />}
                <span style={{ fontSize: 22, fontWeight: 800, color: s.danger ? "#ef4444" : "var(--text)" }}>{s.value}</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Inventory Tab ─────────────────────────────────────────────── */
const PAGE_SIZE = 50;

function InventoryTab({ warehouseId, stat }: { warehouseId: number; stat?: WarehouseStat }) {
  const [rows, setRows]       = useState<InventoryRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [q, setQ]             = useState("");
  const [qInput, setQInput]   = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm]   = useState<Partial<InventoryRow>>({});
  const [editNote, setEditNote]   = useState("");
  const [saving, setSaving]   = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addProductId, setAddProductId] = useState("");
  const [addMin, setAddMin]   = useState("0");
  const [addQty, setAddQty]   = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ warehouse_id: String(warehouseId), page: String(page), limit: String(PAGE_SIZE) });
    if (q) params.set("q", q);
    const res = await fetch(`/api/inventory?${params}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [warehouseId, page, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [warehouseId, q]);

  /* Debounce search input before it hits the server */
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    const res = await fetch("/api/inventory", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId, ...editForm, note: editNote }) });
    setSaving(false);
    if (res.ok) { toast.success("Залишки оновлено"); setEditingId(null); setEditNote(""); load(); }
    else { const e = await res.json(); toast.error(e.error); }
  }

  async function addEntry() {
    if (!addProductId) { toast.error("Вкажіть товар"); return; }
    const res = await fetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: Number(addProductId), warehouse_id: warehouseId, quantity: Number(addQty), min_quantity: Number(addMin) }) });
    if (res.ok) { toast.success("Запис додано"); setShowAdd(false); setAddProductId(""); setAddMin("0"); setAddQty("0"); load(); }
    else { const e = await res.json(); toast.error(e.error); }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 20, maxWidth: 560 }}>
        {[{ label: "Позицій", val: (stat?.totalProducts ?? total).toLocaleString("uk-UA") }, { label: "Всього одиниць", val: (stat?.totalQty ?? 0).toLocaleString("uk-UA") }, { label: "Під мінімумом", val: stat?.lowStock ?? 0, danger: (stat?.lowStock ?? 0) > 0 }].map((s: any, i) => (
          <div key={i} className="crm-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.danger ? "var(--danger)" : "var(--text)" }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <div style={{ position: "relative", maxWidth: 360, flex: 1 }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input className="crm-input" placeholder="Пошук за назвою або кодом..." value={qInput} onChange={(e) => setQInput(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus size={14} /> Додати</button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="crm-card animate-scale-in" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Додати запис залишків</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px auto", gap: 10, alignItems: "end" }}>
            {[{ label: "ID товару *", val: addProductId, set: setAddProductId, ph: "123" }, { label: "Поточний", val: addQty, set: setAddQty }, { label: "Мінімум", val: addMin, set: setAddMin }].map((f: any) => (
              <div key={f.label}>
                <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>{f.label}</label>
                <input className="crm-input" type={f.ph ? "text" : "number"} value={f.val} onChange={(e) => f.set(e.target.value)} placeholder={f.ph} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn-primary" onClick={addEntry}><Save size={13} /> Додати</button>
              <button className="btn-ghost" onClick={() => setShowAdd(false)} style={{ padding: "8px 10px" }}><X size={13} /></button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="crm-card">
        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>Завантаження...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "64px 24px", textAlign: "center" }}>
            <Boxes size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px" }} />
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>{q ? "Нічого не знайдено" : "Записів залишків немає"}</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th style={{ textAlign: "right" }}>Поч. залишок</th>
                  <th style={{ textAlign: "right" }}>Поточний</th>
                  <th style={{ textAlign: "right" }}>Резерв</th>
                  <th style={{ textAlign: "right" }}>Доступний</th>
                  <th style={{ textAlign: "right" }}>Мінімум</th>
                  <th style={{ width: 180 }}>Наповнення</th>
                  <th style={{ textAlign: "right" }}>Дії</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const available = Number(row.quantity) - Number(row.reserved);
                  const isLow = Number(row.min_quantity) > 0 && Number(row.quantity) <= Number(row.min_quantity);
                  const isEditing = editingId === row.id;
                  const fillPct = Number(row.min_quantity) > 0
                    ? Math.min(100, Math.round(Number(row.quantity) / Number(row.min_quantity) * 100))
                    : (Number(row.quantity) > 0 ? 100 : 0);
                  const barColor = fillPct >= 70 ? "#10b981" : fillPct >= 30 ? "#f59e0b" : "#ef4444";

                  const editInput = (field: keyof InventoryRow) => (
                    <input className="crm-input" type="number" value={editForm[field] as number} onChange={(e) => setEditForm({ ...editForm, [field]: Number(e.target.value) })} style={{ width: 80, textAlign: "right" }} />
                  );

                  return (
                    <tr key={row.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{row.product?.title ?? `#${row.product_id}`}</div>
                        {row.product?.pcode && <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: "monospace" }}>{row.product.pcode}</div>}
                      </td>
                      <td style={{ textAlign: "right" }}>{isEditing ? editInput("initial_quantity") : <span style={{ fontFamily: "monospace" }}>{Number(row.initial_quantity).toFixed(0)}</span>}</td>
                      <td style={{ textAlign: "right" }}>
                        {isEditing ? editInput("quantity") : (
                          <InventoryHistoryDialog productId={row.product_id} warehouseId={row.warehouse_id}>
                            {(openHistory) => (
                              <button
                                onClick={openHistory}
                                title="Історія залишку"
                                style={{ fontFamily: "monospace", fontWeight: 700, color: isLow ? "var(--danger)" : "var(--text)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }}
                              >
                                {Number(row.quantity).toFixed(0)}{isLow && <AlertTriangle size={11} style={{ marginLeft: 4, display: "inline" }} />}
                              </button>
                            )}
                          </InventoryHistoryDialog>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>{isEditing ? editInput("reserved") : <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>{Number(row.reserved).toFixed(0)}</span>}</td>
                      <td style={{ textAlign: "right" }}>
                        <span style={{ fontFamily: "monospace", fontWeight: 600, color: available < 0 ? "var(--danger)" : available === 0 ? "var(--warning)" : "var(--success)" }}>{available.toFixed(0)}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>{isEditing ? editInput("min_quantity") : <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>{Number(row.min_quantity).toFixed(0)}</span>}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${fillPct}%`, background: barColor, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: barColor, width: 32, textAlign: "right" }}>{fillPct}%</span>
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {isEditing ? (
                          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
                            <input
                              className="crm-input" placeholder="Примітка (не обов'язково)"
                              value={editNote} onChange={(e) => setEditNote(e.target.value)}
                              style={{ width: 140, fontSize: 12 }}
                            />
                            <button className="btn-primary" onClick={saveEdit} disabled={saving} style={{ padding: "5px 10px", fontSize: 12 }}><Save size={12} /> Зберегти</button>
                            <button className="btn-ghost" onClick={() => { setEditingId(null); setEditNote(""); }} style={{ padding: "5px 8px" }}><X size={12} /></button>
                          </div>
                        ) : (
                          <button className="btn-ghost" onClick={() => { setEditingId(row.id); setEditForm({ quantity: row.quantity, reserved: row.reserved, initial_quantity: row.initial_quantity, min_quantity: row.min_quantity }); }} style={{ padding: "5px 10px", fontSize: 12 }}>Змінити</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ padding: "6px 14px", opacity: page <= 1 ? 0.5 : 1 }}>← Попередня</button>
          <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Сторінка {page} з {totalPages}</span>
          <button className="btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} style={{ padding: "6px 14px", opacity: page >= totalPages ? 0.5 : 1 }}>Наступна →</button>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────── */
function WarehousesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "overview";

  const [stats, setStats]     = useState<WarehouseStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<WarehouseStat | null>(null);
  const [form, setForm]       = useState(emptyForm);
  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm] = useState(emptyForm);
  const [saving, setSaving]   = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/warehouses/stats");
    const data = await res.json();
    setStats(Array.isArray(data) ? data : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function setTab(tab: string) { router.push(`/warehouses?tab=${tab}`, { scroll: false }); }

  async function saveEdit() {
    if (!editRow) return;
    setSaving(true);
    const res = await fetch(`/api/warehouses/${editRow.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (res.ok) { toast.success("Збережено"); setEditRow(null); load(); }
    else { const e = await res.json(); toast.error(e.error); }
  }

  async function deleteRow(id: number) {
    if (!confirm("Видалити склад?")) return;
    const res = await fetch(`/api/warehouses/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Видалено"); load(); }
    else toast.error("Помилка");
  }

  async function createWarehouse() {
    if (!newForm.title.trim()) { toast.error("Вкажіть назву"); return; }
    setSaving(true);
    const res = await fetch("/api/warehouses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newForm) });
    setSaving(false);
    if (res.ok) { toast.success("Склад створено"); setShowCreate(false); setNewForm(emptyForm); load(); }
    else { const e = await res.json(); toast.error(e.error); }
  }

  /* Build tabs: Overview + one per warehouse */
  const tabs = [
    { id: "overview", label: "Загальний огляд" },
    ...stats.map((w) => ({ id: String(w.id), label: w.title })),
  ];

  const InlineForm = ({ f, setF, onSave, onCancel, label }: any) => (
    <div className="crm-card animate-scale-in" style={{ padding: 20, marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>{label}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 140px auto", gap: 12, alignItems: "end" }}>
        <div><label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Назва *</label><input className="crm-input" value={f.title} onChange={(e: any) => setF({ ...f, title: e.target.value })} /></div>
        <div><label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Адреса</label><input className="crm-input" value={f.address} onChange={(e: any) => setF({ ...f, address: e.target.value })} /></div>
        <div><label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Порядок</label><input className="crm-input" type="number" value={f.priority} onChange={(e: any) => setF({ ...f, priority: Number(e.target.value) })} /></div>
        <div style={{ paddingBottom: 4 }}><label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13 }}><input type="checkbox" checked={f.active === 1} onChange={(e: any) => setF({ ...f, active: e.target.checked ? 1 : 0 })} /> Активний</label></div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-primary" onClick={onSave} disabled={saving}><Save size={13} /> Зберегти</button>
          <button className="btn-ghost" onClick={onCancel} style={{ padding: "8px 10px" }}><X size={13} /></button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Header
        title="Склади"
        subtitle="Управління складськими приміщеннями"
        actions={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={14} /> Новий склад</button>}
      />

      <div className="page-content" style={{ padding: "24px 28px", flex: 1 }}>

        {/* ── Tab bar ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid var(--border)", paddingBottom: 0 }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                style={{
                  padding: "10px 22px", fontSize: 13.5, fontWeight: 600,
                  background: "none", border: "none", cursor: "pointer",
                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                  borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  marginBottom: -2, transition: "color 0.15s, border-color 0.15s",
                  display: "flex", alignItems: "center", gap: 7,
                }}
              >
                {tab.id !== "overview" && <Warehouse size={13} />}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Inline forms (edit / create) ── */}
        {showCreate && <InlineForm f={newForm} setF={setNewForm} onSave={createWarehouse} onCancel={() => { setShowCreate(false); setNewForm(emptyForm); }} label="Новий склад" />}
        {editRow    && <InlineForm f={form}    setF={setForm}    onSave={saveEdit}        onCancel={() => setEditRow(null)} label={`Редагувати: ${editRow.title}`} />}

        {/* ── Tab content ── */}
        {loading ? (
          <div style={{ padding: 64, textAlign: "center", color: "var(--text-muted)" }}>Завантаження...</div>
        ) : activeTab === "overview" ? (
          stats.length === 0 ? (
            <div style={{ padding: "64px 24px", textAlign: "center" }}>
              <Warehouse size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px" }} />
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Складів ще немає</p>
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => setShowCreate(true)}><Plus size={14} /> Створити перший склад</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {stats.map((w, i) => (
                <WarehouseWidget
                  key={w.id} w={w} animDelay={i * 120}
                  onEdit={(row) => { setEditRow(row); setForm({ title: row.title, address: row.address || "", priority: row.priority, active: row.active }); }}
                  onDelete={deleteRow}
                  onTabClick={(id) => setTab(String(id))}
                />
              ))}
            </div>
          )
        ) : (
          <InventoryTab warehouseId={Number(activeTab)} stat={stats.find((s) => String(s.id) === activeTab)} />
        )}
      </div>
    </>
  );
}

export default function WarehousesPage() {
  return (
    <Suspense fallback={<div style={{ padding: 64, textAlign: "center", color: "var(--text-muted)" }}>Завантаження...</div>}>
      <WarehousesContent />
    </Suspense>
  );
}
