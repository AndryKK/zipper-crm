"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/admin/header";
import {
  Boxes, Search, Save, X, Plus, ChevronDown, AlertTriangle, Package,
} from "lucide-react";
import { toast } from "sonner";
import { InventoryHistoryDialog } from "@/components/admin/inventory-history-dialog";
import { SortableTh, Pagination } from "@/components/admin/data-table-controls";

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
  const [filteredAgg, setFilteredAgg] = useState<{ totalQty: number; lowStock: number; positions: number } | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<InventoryRow>>({});
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [restockingId, setRestockingId] = useState<number | null>(null);
  const [restockDelta, setRestockDelta] = useState("");
  const [restockNote, setRestockNote] = useState("");

  /* Add-new inline form */
  const [showAdd, setShowAdd] = useState(false);
  const [addProductId, setAddProductId] = useState("");
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

  // The live warehouse_stats view — cheap regardless
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
    if (sortBy) { params.set("sort_by", sortBy); params.set("sort_dir", sortDir); }
    const res = await fetch(`/api/inventory?${params}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setTotal(data.total ?? 0);
    setFilteredAgg(data.aggregate ?? null);
    setLoading(false);
  }, [selectedWarehouse, page, q, sortBy, sortDir]);

  useEffect(() => { loadWarehouses(); loadStats(); }, []);
  useEffect(() => { loadInventory(); }, [loadInventory]);
  useEffect(() => { setPage(1); }, [selectedWarehouse, q, sortBy, sortDir]);

  function handleSort(key: string) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  }

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
      min_quantity: row.min_quantity,
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    const res = await fetch("/api/inventory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingId, mode: "set", ...editForm, note: editNote }),
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

  // "Поставка" — adds a delivered quantity to what's already there, instead
  // of overwriting it like "Змінити" does. Both reset initial_quantity to
  // the resulting total — see app/api/inventory/route.ts.
  async function saveRestock() {
    if (!restockingId || !restockDelta) return;
    setSaving(true);
    const res = await fetch("/api/inventory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: restockingId, mode: "restock", deltaQty: Number(restockDelta), note: restockNote }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Поставку додано");
      setRestockingId(null);
      setRestockDelta("");
      setRestockNote("");
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
        min_quantity: Number(addMin),
      }),
    });
    if (res.ok) {
      toast.success("Запис додано");
      setShowAdd(false);
      setAddProductId("");
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
  // While a search filters the table, the cards must reflect just the
  // filtered matches — otherwise "Всього одиниць" shows the whole
  // warehouse's total next to a table with 1 result, which reads as a bug.
  const summary = filteredAgg
    ? { positions: filteredAgg.positions, totalQty: filteredAgg.totalQty, lowStock: filteredAgg.lowStock }
    : currentStat
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

        {/* Summary cards — from the live warehouse_stats view, not
            computed from the (possibly huge) row set on this page. When a
            search is active they switch to a live total over just the
            filtered matches instead (see filteredAgg). */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 20,
          }}
        >
          <div className="crm-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              Позицій{filteredAgg && " (за пошуком)"}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text)" }}>{summary.positions.toLocaleString("uk-UA")}</div>
          </div>
          <div className="crm-card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              Всього одиниць{filteredAgg && " (за пошуком)"}
            </div>
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
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
              Додати запис залишків
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
              "Поч. залишок" не вводиться окремо — введена тут кількість автоматично стає базою 100% наповнення.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px auto", gap: 10, alignItems: "end" }}>
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
                    <SortableTh label="Товар" sortKey="title" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortableTh label="Склад" sortKey="warehouse" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortableTh label="Поч. залишок" sortKey="initial_quantity" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                    <SortableTh label="Поточний" sortKey="quantity" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                    <SortableTh label="Резерв" sortKey="reserved" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                    <th style={{ textAlign: "right" }}>Доступний</th>
                    <SortableTh label="Мінімум" sortKey="min_quantity" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
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
                              {row.product_uk?.title ?? row.product?.title ?? `#${row.product_id}`}
                            </div>
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
                          <span
                            style={{ fontFamily: "monospace", color: "var(--text-muted)" }}
                            title="Не редагується напряму — дорівнює значенню «Поточний» на момент останнього ручного збереження"
                          >
                            {Number(row.initial_quantity).toFixed(0)}
                          </span>
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
                            ) : restockingId === row.id ? (
                              <>
                                <input
                                  className="crm-input" type="number" placeholder="+к-сть"
                                  value={restockDelta} onChange={(e) => setRestockDelta(e.target.value)}
                                  style={{ width: 70, fontSize: 12, textAlign: "right" }}
                                />
                                <input
                                  className="crm-input" placeholder="Примітка"
                                  value={restockNote} onChange={(e) => setRestockNote(e.target.value)}
                                  style={{ width: 110, fontSize: 12 }}
                                />
                                <button
                                  className="btn-primary"
                                  onClick={saveRestock}
                                  disabled={saving || !restockDelta}
                                  style={{ padding: "5px 10px", fontSize: 12 }}
                                >
                                  <Package size={12} /> Додати
                                </button>
                                <button
                                  className="btn-ghost"
                                  onClick={() => { setRestockingId(null); setRestockDelta(""); setRestockNote(""); }}
                                  style={{ padding: "5px 8px" }}
                                >
                                  <X size={12} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="btn-ghost"
                                  onClick={() => setRestockingId(row.id)}
                                  title="Поставка — додати кількість до поточної"
                                  style={{ padding: "5px 10px", fontSize: 12 }}
                                >
                                  <Package size={12} /> Поставка
                                </button>
                                <button
                                  className="btn-ghost"
                                  onClick={() => startEdit(row)}
                                  title="Ручне введення — задати точну кількість"
                                  style={{ padding: "5px 10px", fontSize: 12 }}
                                >
                                  Змінити
                                </button>
                              </>
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
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", marginTop: 16 }}>
            Сторінка {page} з {totalPages} ({total.toLocaleString("uk-UA")} записів)
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
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
