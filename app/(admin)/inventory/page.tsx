"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/admin/header";
import {
  Boxes, Search, Save, X, Plus, ChevronDown, AlertTriangle, Package,
} from "lucide-react";
import { toast } from "sonner";
import { InventoryHistoryDialog } from "@/components/admin/inventory-history-dialog";

const PAGE_SIZE = 50;

interface WarehouseOption { id: number; title: string; }
interface WarehouseStat {
  id: number;
  totalProducts: number;
  totalQty: number;
  lowStock: number;
}
interface InventoryRow {
  id: number;
  product_id: number;
  warehouse_id: number;
  quantity: number;
  reserved: number;
  initial_quantity: number;
  min_quantity: number;
  product?: { id: number; title: string; pcode?: string; lang: string };
  product_uk?: { id: number; title: string } | null;
  warehouse?: { id: number; title: string };
}

function InventoryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const warehouseIdParam = searchParams.get("warehouse_id");

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(warehouseIdParam || "");
  const [stats, setStats] = useState<WarehouseStat[]>([]);
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<InventoryRow>>({});
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  /* Add-new inline form */
  const [showAdd, setShowAdd] = useState(false);
  const [addProductId, setAddProductId] = useState("");
  const [addInitial, setAddInitial] = useState("0");
  const [addMin, setAddMin] = useState("0");
  const [addQty, setAddQty] = useState("0");

  async function loadWarehouses() {
    const res = await fetch("/api/warehouses");
    const data = await res.json();
    setWarehouses(data);
    if (!selectedWarehouse && data.length > 0) {
      setSelectedWarehouse(String(data[0].id));
    }
  }

  // The daily-refreshed warehouse_stats materialized view — cheap regardless
  // of how many inventory rows exist, unlike summing the full row set here.
  async function loadStats() {
    const res = await fetch("/api/warehouses/stats");
    if (res.ok) setStats(await res.json());
  }

  const loadInventory = useCallback(async () => {
    if (!selectedWarehouse) return;
    setLoading(true);
    const params = new URLSearchParams({ warehouse_id: selectedWarehouse, page: String(page), limit: String(PAGE_SIZE) });
    if (q) params.set("q", q);
    const res = await fetch(`/api/inventory?${params}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [selectedWarehouse, page, q]);

  useEffect(() => { loadWarehouses(); loadStats(); }, []);
  useEffect(() => { loadInventory(); }, [loadInventory]);
  useEffect(() => { setPage(1); }, [selectedWarehouse, q]);

  /* Debounce search input before it hits the server */
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  function startEdit(row: InventoryRow) {
    setEditingId(row.id);
    setEditForm({
      quantity: row.quantity,
      reserved: row.reserved,
      initial_quantity: row.initial_quantity,
      min_quantity: row.min_quantity,
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    const res = await fetch("/api/inventory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, ...editForm, note: editNote }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Залишки оновлено");
      setEditingId(null);
      setEditNote("");
      loadInventory();
    } else {
      const e = await res.json();
      toast.error(e.error);
    }
  }

  async function addEntry() {
    if (!addProductId || !selectedWarehouse) {
      toast.error("Вкажіть товар");
      return;
    }
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: Number(addProductId),
        warehouse_id: Number(selectedWarehouse),
        quantity: Number(addQty),
        initial_quantity: Number(addInitial),
        min_quantity: Number(addMin),
      }),
    });
    if (res.ok) {
      toast.success("Запис додано");
      setShowAdd(false);
      setAddProductId("");
      setAddInitial("0");
      setAddMin("0");
      setAddQty("0");
      loadInventory();
      loadStats();
    } else {
      const e = await res.json();
      toast.error(e.error);
    }
  }

  const currentWarehouse = warehouses.find((w) => String(w.id) === selectedWarehouse);
  const currentStat = stats.find((s) => String(s.id) === selectedWarehouse);
  const summary = currentStat
    ? { positions: currentStat.totalProducts, totalQty: currentStat.totalQty, lowStock: currentStat.lowStock }
    : stats.reduce((acc, s) => ({
        positions: acc.positions + s.totalProducts,
        totalQty: acc.totalQty + s.totalQty,
        lowStock: acc.lowStock + s.lowStock,
      }), { positions: 0, totalQty: 0, lowStock: 0 });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <Header
        title="Залишки на складі"
        subtitle={currentWarehouse ? `${currentWarehouse.title}` : "Оберіть склад"}
        actions={
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Додати запис
          </button>
        }
      />

      <div className="page-content" style={{ padding: "24px 28px", flex: 1 }}>

        {/* Summary cards — from the daily-refreshed warehouse_stats view, not
            computed from the (possibly huge) row set on this page */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 20,
          }}
        >
          <div className="crm-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Позицій</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text)" }}>{summary.positions.toLocaleString("uk-UA")}</div>
          </div>
          <div className="crm-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Всього одиниць</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text)" }}>{summary.totalQty.toLocaleString("uk-UA")}</div>
          </div>
          <div className="crm-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Під мінімумом</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: summary.lowStock > 0 ? "var(--danger)" : "var(--success)" }}>
              {summary.lowStock}
            </div>
          </div>
        </div>

        {/* Filters row */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 16,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Warehouse selector */}
          <div style={{ position: "relative" }}>
            <select
              value={selectedWarehouse}
              onChange={(e) => {
                setSelectedWarehouse(e.target.value);
                router.push(`/inventory?warehouse_id=${e.target.value}`);
              }}
              className="crm-input"
              style={{ paddingRight: 32, appearance: "none", cursor: "pointer", minWidth: 160 }}
            >
              <option value="">Всі склади</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.title}</option>
              ))}
            </select>
            <ChevronDown
              size={13}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Search */}
          <div style={{ position: "relative", flex: 1, maxWidth: 360 }}>
            <Search
              size={14}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
            <input
              className="crm-input"
              placeholder="Пошук за назвою або кодом..."
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              style={{ paddingLeft: 36 }}
            />
          </div>
        </div>

        {/* Add entry form */}
        {showAdd && (
          <div className="crm-card animate-scale-in" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 14 }}>
              Додати запис залишків
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 100px auto", gap: 10, alignItems: "end" }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  ID товару *
                </label>
                <input
                  className="crm-input"
                  type="number"
                  placeholder="напр. 123"
                  value={addProductId}
                  onChange={(e) => setAddProductId(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  Поч. залишок
                </label>
                <input
                  className="crm-input"
                  type="number"
                  value={addInitial}
                  onChange={(e) => setAddInitial(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  Поточний
                </label>
                <input
                  className="crm-input"
                  type="number"
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  Мінімум
                </label>
                <input
                  className="crm-input"
                  type="number"
                  value={addMin}
                  onChange={(e) => setAddMin(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn-primary" onClick={addEntry} style={{ whiteSpace: "nowrap" }}>
                  <Save size={13} /> Додати
                </button>
                <button className="btn-ghost" onClick={() => setShowAdd(false)} style={{ padding: "8px 10px" }}>
                  <X size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="crm-card">
          {loading ? (
            <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
              Завантаження...
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: "64px 24px", textAlign: "center" }}>
              <Boxes size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px" }} />
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
                {q ? "Нічого не знайдено" : "Записів залишків немає"}
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th>Склад</th>
                    <th style={{ textAlign: "right" }}>Поч. залишок</th>
                    <th style={{ textAlign: "right" }}>Поточний</th>
                    <th style={{ textAlign: "right" }}>Резерв</th>
                    <th style={{ textAlign: "right" }}>Доступний</th>
                    <th style={{ textAlign: "right" }}>Мінімум</th>
                    <th style={{ textAlign: "right" }}>Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const available = Number(row.quantity) - Number(row.reserved);
                    const isLow = Number(row.quantity) <= Number(row.min_quantity) && Number(row.min_quantity) > 0;
                    const isEditing = editingId === row.id;

                    return (
                      <tr key={row.id}>
                        <td>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                              {row.product?.title ?? `#${row.product_id}`}
                            </div>
                            {row.product_uk && (
                              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                                {row.product_uk.title}
                              </div>
                            )}
                            {row.product?.pcode && (
                              <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: "monospace" }}>
                                {row.product.pcode}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ color: "var(--text-muted)", fontSize: 12.5 }}>
                          {row.warehouse?.title ?? `#${row.warehouse_id}`}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {isEditing ? (
                            <input
                              className="crm-input"
                              type="number"
                              value={editForm.initial_quantity}
                              onChange={(e) => setEditForm({ ...editForm, initial_quantity: Number(e.target.value) })}
                              style={{ width: 80, textAlign: "right" }}
                            />
                          ) : (
                            <span style={{ fontFamily: "monospace" }}>{Number(row.initial_quantity).toFixed(0)}</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {isEditing ? (
                            <input
                              className="crm-input"
                              type="number"
                              value={editForm.quantity}
                              onChange={(e) => setEditForm({ ...editForm, quantity: Number(e.target.value) })}
                              style={{ width: 80, textAlign: "right" }}
                            />
                          ) : (
                            <InventoryHistoryDialog productId={row.product_id} warehouseId={row.warehouse_id}>
                              {(openHistory) => (
                                <button
                                  onClick={openHistory}
                                  title="Історія залишку"
                                  style={{
                                    fontFamily: "monospace",
                                    fontWeight: 700,
                                    color: isLow ? "var(--danger)" : "var(--text)",
                                    background: "none", border: "none", cursor: "pointer",
                                    textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3,
                                  }}
                                >
                                  {Number(row.quantity).toFixed(0)}
                                  {isLow && <AlertTriangle size={11} style={{ marginLeft: 4, display: "inline" }} />}
                                </button>
                              )}
                            </InventoryHistoryDialog>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {isEditing ? (
                            <input
                              className="crm-input"
                              type="number"
                              value={editForm.reserved}
                              onChange={(e) => setEditForm({ ...editForm, reserved: Number(e.target.value) })}
                              style={{ width: 80, textAlign: "right" }}
                            />
                          ) : (
                            <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>
                              {Number(row.reserved).toFixed(0)}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 600,
                              color: available < 0 ? "var(--danger)" : available === 0 ? "var(--warning)" : "var(--success)",
                            }}
                          >
                            {available.toFixed(0)}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {isEditing ? (
                            <input
                              className="crm-input"
                              type="number"
                              value={editForm.min_quantity}
                              onChange={(e) => setEditForm({ ...editForm, min_quantity: Number(e.target.value) })}
                              style={{ width: 80, textAlign: "right" }}
                            />
                          ) : (
                            <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>
                              {Number(row.min_quantity).toFixed(0)}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                            {isEditing ? (
                              <>
                                <input
                                  className="crm-input" placeholder="Примітка"
                                  value={editNote} onChange={(e) => setEditNote(e.target.value)}
                                  style={{ width: 120, fontSize: 12 }}
                                />
                                <button
                                  className="btn-primary"
                                  onClick={saveEdit}
                                  disabled={saving}
                                  style={{ padding: "5px 10px", fontSize: 12 }}
                                >
                                  <Save size={12} /> Зберегти
                                </button>
                                <button
                                  className="btn-ghost"
                                  onClick={() => { setEditingId(null); setEditNote(""); }}
                                  style={{ padding: "5px 8px" }}
                                >
                                  <X size={12} />
                                </button>
                              </>
                            ) : (
                              <button
                                className="btn-ghost"
                                onClick={() => startEdit(row)}
                                style={{ padding: "5px 10px", fontSize: 12 }}
                              >
                                Змінити
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
          )}
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
            <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ padding: "6px 14px", opacity: page <= 1 ? 0.5 : 1 }}>← Попередня</button>
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Сторінка {page} з {totalPages} ({total.toLocaleString("uk-UA")} записів)</span>
            <button className="btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} style={{ padding: "6px 14px", opacity: page >= totalPages ? 0.5 : 1 }}>Наступна →</button>
          </div>
        )}
      </div>
    </>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
        Завантаження...
      </div>
    }>
      <InventoryContent />
    </Suspense>
  );
}
