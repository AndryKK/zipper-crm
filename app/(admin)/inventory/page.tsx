"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/admin/header";
import {
  Boxes, Search, Save, X, Plus, ChevronDown, AlertTriangle, Package, History,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

function rowTitle(row: InventoryRow) {
  return row.product_uk?.title ?? row.product?.title ?? `#${row.product_id}`;
}

// type="text" + inputMode="numeric" instead of type="number": lets a 0 be
// cleared to a genuinely empty field (type="number" can leave a stray "0"
// impossible to fully delete in some browsers), avoids the accidental
// scroll-wheel-changes-the-value and leading-zero quirks type="number" has,
// and still brings up the numeric keypad on phones. select-on-focus is a
// second safety net for editing an existing value that ISN'T 0.
function digitsOnly(v: string) {
  return v.replace(/\D/g, "");
}

function BigNumberInput({
  value, onChange, autoFocus, placeholder = "0",
}: {
  value: string; onChange: (v: string) => void; autoFocus?: boolean; placeholder?: string;
}) {
  return (
    <input
      className="crm-input crm-input-qty"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoFocus={autoFocus}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(digitsOnly(e.target.value))}
      onFocus={(e) => e.target.select()}
      style={{ fontSize: 22, padding: "12px 14px" }}
    />
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.3 }}>
      {children}
    </label>
  );
}

// Mobile-only stat tile (Поточний/Резерв/Доступний/Мінімум) inside a card.
// `onClick` is only passed for "Поточний", which opens the history dialog —
// mirrors the underlined, clickable number in the desktop table's cell.
function StatTile({
  label, value, color, onClick, flagged,
}: {
  label: string; value: number; color?: string; onClick?: () => void; flagged?: boolean;
}) {
  const content = (
    <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: color ?? "var(--text)" }}>
      {value.toFixed(0)}
      {flagged && <AlertTriangle size={12} style={{ marginLeft: 4, display: "inline", verticalAlign: "middle" }} />}
    </div>
  );
  return (
    <div style={{ background: "var(--bg)", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginBottom: 2, display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        {/* Tapping the value opens the history dialog, but on a phone
            there's no hover to reveal that the way the desktop table's
            dotted underline does — a small icon makes it obvious without
            having to tap first to find out. */}
        {onClick && (
          <span title="Тапніть, щоб переглянути історію" style={{ display: "inline-flex" }}>
            <History size={10} />
          </span>
        )}
      </div>
      {onClick ? (
        <button
          onClick={onClick}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
        >
          {content}
        </button>
      ) : content}
    </div>
  );
}

// Persisted per-browser display preference, not a business setting — a
// plain localStorage flag is enough, no need for a DB column/settings row.
const HIDE_UNENTERED_KEY = "inventory-hide-unentered";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 9, cursor: "pointer", userSelect: "none" }}>
      <span
        onClick={() => onChange(!checked)}
        style={{
          width: 36, height: 21, borderRadius: 999, flexShrink: 0, position: "relative",
          background: checked ? "var(--accent)" : "var(--border)",
          transition: "background 0.15s ease",
        }}
      >
        <span
          style={{
            position: "absolute", top: 2, left: checked ? 17 : 2,
            width: 17, height: 17, borderRadius: "50%", background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "left 0.15s ease",
          }}
        />
      </span>
      <span style={{ fontSize: 13, color: "var(--text)" }}>{label}</span>
    </label>
  );
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
  // Starts false on the server-rendered pass (matches SSR/CSR markup),
  // then syncs from localStorage right after mount — see the effect below.
  const [hideUnentered, setHideUnentered] = useState(false);

  /* Edit ("Змінити") — now a popup instead of turning the row into inputs,
     both because that was cramped and because it's unusable on a phone
     screen. editForm holds strings, not numbers — see digitsOnly's comment
     on why. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ quantity: "", reserved: "", min_quantity: "" });
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);

  /* Restock ("Поставка") — same popup treatment. */
  const [restockingId, setRestockingId] = useState<number | null>(null);
  const [restockDelta, setRestockDelta] = useState("");
  const [restockNote, setRestockNote] = useState("");

  /* Add-new inline form */
  const [showAdd, setShowAdd] = useState(false);
  const [addProductId, setAddProductId] = useState("");
  const [addMin, setAddMin] = useState("");
  const [addQty, setAddQty] = useState("");

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
    if (hideUnentered) params.set("hide_unentered", "1");
    const res = await fetch(`/api/inventory?${params}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setTotal(data.total ?? 0);
    setFilteredAgg(data.aggregate ?? null);
    setLoading(false);
  }, [selectedWarehouse, page, q, sortBy, sortDir, hideUnentered]);

  useEffect(() => { loadWarehouses(); loadStats(); }, []);
  useEffect(() => { loadInventory(); }, [loadInventory]);
  useEffect(() => { setPage(1); }, [selectedWarehouse, q, sortBy, sortDir, hideUnentered]);

  // Restore the toggle's saved state once mounted (kept out of the
  // initial useState so server-rendered and first-client-render markup
  // still match — reading localStorage during render would break that).
  useEffect(() => {
    if (localStorage.getItem(HIDE_UNENTERED_KEY) === "1") setHideUnentered(true);
  }, []);

  function toggleHideUnentered(next: boolean) {
    setHideUnentered(next);
    localStorage.setItem(HIDE_UNENTERED_KEY, next ? "1" : "0");
  }

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
    // A 0 starts the field empty instead of showing "0" — matches how
    // restockDelta/addQty already start empty, and means typing a real
    // quantity never has to begin with deleting a placeholder zero first.
    setEditForm({
      quantity: row.quantity ? String(row.quantity) : "",
      reserved: row.reserved ? String(row.reserved) : "",
      min_quantity: row.min_quantity ? String(row.min_quantity) : "",
    });
    setEditNote("");
  }

  function closeEdit() {
    setEditingId(null);
    setEditForm({ quantity: "", reserved: "", min_quantity: "" });
    setEditNote("");
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    const res = await fetch("/api/inventory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingId,
        mode: "set",
        quantity: Number(editForm.quantity) || 0,
        reserved: Number(editForm.reserved) || 0,
        min_quantity: Number(editForm.min_quantity) || 0,
        note: editNote,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Залишки оновлено");
      closeEdit();
      loadInventory();
    } else {
      const e = await res.json();
      toast.error(e.error);
    }
  }

  function closeRestock() {
    setRestockingId(null);
    setRestockDelta("");
    setRestockNote("");
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
      closeRestock();
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
        quantity: Number(addQty) || 0,
        min_quantity: Number(addMin) || 0,
      }),
    });
    if (res.ok) {
      toast.success("Запис додано");
      setShowAdd(false);
      setAddProductId("");
      setAddMin("");
      setAddQty("");
      loadInventory();
      loadStats();
    } else {
      const e = await res.json();
      toast.error(e.error);
    }
  }

  const currentWarehouse = warehouses.find((w) => String(w.id) === selectedWarehouse);
  const currentStat = stats.find((s) => String(s.id) === selectedWarehouse);
  const editingRow = rows.find((r) => r.id === editingId) ?? null;
  const restockingRow = rows.find((r) => r.id === restockingId) ?? null;
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
          // Label hidden below `sm`, matching TranslateButton elsewhere —
          // full text left almost no room for the title/subtitle next to
          // it (measured: the title truncated to a couple of characters,
          // and the row still overflowed the screen by a few pixels).
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> <span className="hidden sm:inline">Додати запис</span>
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
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Під мінімумом</div>
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

          <Toggle
            checked={hideUnentered}
            onChange={toggleHideUnentered}
            label="Не відображати не введені позиції"
          />
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
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  placeholder="0"
                  value={addQty}
                  onChange={(e) => setAddQty(digitsOnly(e.target.value))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                  Мінімум
                </label>
                <input
                  className="crm-input"
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  placeholder="0"
                  value={addMin}
                  onChange={(e) => setAddMin(digitsOnly(e.target.value))}
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

        {loading ? (
          <div className="crm-card" style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
            Завантаження...
          </div>
        ) : rows.length === 0 ? (
          <div className="crm-card" style={{ padding: "64px 24px", textAlign: "center" }}>
            <Boxes size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px" }} />
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
              {q ? "Нічого не знайдено" : "Записів залишків немає"}
            </p>
          </div>
        ) : (
          <>
            {/* ── Desktop table (>=1024px, matches Sidebar's own
                drawer/push breakpoint — the table is too cramped below
                that, same width the sidebar itself switches to a mobile
                drawer at) ────────────────────────────────────────────── */}
            <div className="crm-card hidden lg:block" style={{ overflowX: "auto" }}>
              <table className="crm-table">
                <thead>
                  <tr>
                    <SortableTh label="Товар" sortKey="title" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortableTh label="Склад" sortKey="warehouse" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortableTh label="Поч. залишок" sortKey="initial_quantity" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                    <SortableTh label="Поточний" sortKey="quantity" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                    <SortableTh label="Резерв" sortKey="reserved" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                    <SortableTh label="Доступний" sortKey="available" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                    <SortableTh label="Мінімум" sortKey="min_quantity" currentSort={sortBy} currentDir={sortDir} onSort={handleSort} align="right" />
                    <th style={{ textAlign: "right" }}>Дії</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const available = Number(row.quantity) - Number(row.reserved);
                    const isLow = Number(row.quantity) <= Number(row.min_quantity) && Number(row.min_quantity) > 0;

                    return (
                      <tr key={row.id}>
                        <td>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{rowTitle(row)}</div>
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
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>
                            {Number(row.reserved).toFixed(0)}
                          </span>
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
                          <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>
                            {Number(row.min_quantity).toFixed(0)}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
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
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Card list below 1024px (phone + tablet, and narrow
                laptop windows) ────────────────────────────────────────── */}
            <div className="lg:hidden flex flex-col gap-2.5">
              {rows.map((row) => {
                const available = Number(row.quantity) - Number(row.reserved);
                const isLow = Number(row.quantity) <= Number(row.min_quantity) && Number(row.min_quantity) > 0;

                return (
                  <div key={row.id} className="crm-card" style={{ padding: 14 }}>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{rowTitle(row)}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
                        {row.product?.pcode && <span style={{ fontFamily: "monospace" }}>{row.product.pcode}</span>}
                        {row.product?.pcode && " · "}
                        {row.warehouse?.title ?? `#${row.warehouse_id}`}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      <InventoryHistoryDialog productId={row.product_id} warehouseId={row.warehouse_id}>
                        {(openHistory) => (
                          <StatTile
                            label="Поточний" value={Number(row.quantity)}
                            color={isLow ? "var(--danger)" : undefined}
                            flagged={isLow}
                            onClick={openHistory}
                          />
                        )}
                      </InventoryHistoryDialog>
                      <StatTile label="Резерв" value={Number(row.reserved)} />
                      <StatTile
                        label="Доступний" value={available}
                        color={available < 0 ? "var(--danger)" : available === 0 ? "var(--warning)" : "var(--success)"}
                      />
                      <StatTile label="Мінімум" value={Number(row.min_quantity)} />
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn-ghost"
                        onClick={() => setRestockingId(row.id)}
                        style={{ flex: 1, justifyContent: "center", padding: "8px 10px", fontSize: 12.5 }}
                      >
                        <Package size={13} /> Поставка
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => startEdit(row)}
                        style={{ flex: 1, justifyContent: "center", padding: "8px 10px", fontSize: 12.5 }}
                      >
                        Змінити
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {totalPages > 1 && (
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", marginTop: 16 }}>
            Сторінка {page} з {totalPages} ({total.toLocaleString("uk-UA")} записів)
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {/* ── Edit popup ("Змінити") ──────────────────────────────────────── */}
      <Dialog open={editingId !== null} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent style={{ maxWidth: 400 }}>
          <DialogHeader>
            <DialogTitle>Змінити залишок</DialogTitle>
          </DialogHeader>
          {editingRow && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "-4px 0 4px" }}>
              {rowTitle(editingRow)}
              {editingRow.product?.pcode && (
                <> · <span className="font-mono">{editingRow.product.pcode}</span></>
              )}
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <FieldLabel>Поточний</FieldLabel>
              <BigNumberInput
                autoFocus
                value={editForm.quantity}
                onChange={(v) => setEditForm((f) => ({ ...f, quantity: v }))}
              />
            </div>
            <div>
              <FieldLabel>Резерв</FieldLabel>
              <BigNumberInput
                value={editForm.reserved}
                onChange={(v) => setEditForm((f) => ({ ...f, reserved: v }))}
              />
            </div>
          </div>
          <div>
            <FieldLabel>Мінімум</FieldLabel>
            <BigNumberInput
              value={editForm.min_quantity}
              onChange={(v) => setEditForm((f) => ({ ...f, min_quantity: v }))}
            />
          </div>
          <div>
            <FieldLabel>Примітка</FieldLabel>
            <input
              className="crm-input"
              placeholder="Причина зміни (необов'язково)"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
            <button className="btn-ghost" onClick={closeEdit}>Скасувати</button>
            <button className="btn-primary" onClick={saveEdit} disabled={saving}>
              <Save size={14} /> Зберегти
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Restock popup ("Поставка") ──────────────────────────────────── */}
      <Dialog open={restockingId !== null} onOpenChange={(open) => !open && closeRestock()}>
        <DialogContent style={{ maxWidth: 360 }}>
          <DialogHeader>
            <DialogTitle>Поставка</DialogTitle>
          </DialogHeader>
          {restockingRow && (
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "-4px 0 4px" }}>
              {rowTitle(restockingRow)} — поточний: <strong>{Number(restockingRow.quantity).toFixed(0)}</strong>
            </p>
          )}
          <div>
            <FieldLabel>Скільки надійшло</FieldLabel>
            <BigNumberInput autoFocus value={restockDelta} onChange={setRestockDelta} />
          </div>
          <div>
            <FieldLabel>Примітка</FieldLabel>
            <input
              className="crm-input"
              placeholder="напр. накладна №..."
              value={restockNote}
              onChange={(e) => setRestockNote(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
            <button className="btn-ghost" onClick={closeRestock}>Скасувати</button>
            <button className="btn-primary" onClick={saveRestock} disabled={saving || !restockDelta}>
              <Package size={14} /> Додати
            </button>
          </div>
        </DialogContent>
      </Dialog>
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
