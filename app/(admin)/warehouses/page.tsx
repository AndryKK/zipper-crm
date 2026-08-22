"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/admin/header";
import {
  Warehouse, Plus, Pencil, Trash2, Save, X,
  MapPin, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Types ─────────────────────────────────────────────────────── */
interface WarehouseStat {
  id: number; title: string; address?: string;
  priority: number; active: number;
  totalProducts: number; totalQty: number; totalMin: number;
  fillPct: number; lowStock: number;
  distribution: { full: number; medium: number; low: number; empty: number };
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
function WarehouseWidget({ w, onEdit, onDelete, onOpenInventory, animDelay }: {
  w: WarehouseStat;
  onEdit: (w: WarehouseStat) => void;
  onDelete: (id: number) => void;
  onOpenInventory: (id: number) => void;
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
      onClick={() => onOpenInventory(w.id)}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 14px 44px rgba(0,0,0,0.14)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = ""; }}
    >
      <div style={{ height: 5, background: gradient }} />
      {/* Padding is a responsive className, not inline style — an inline
          style property always wins over any class rule regardless of
          breakpoint, which would have silently pinned this to the mobile
          value at every width. */}
      <div className="p-[18px_16px_20px] sm:p-[22px_28px_24px]">

        {/* Row 1: icon+name+address (own line on mobile) then %+actions
            (own line, spread edge-to-edge) — squeezed into one row before,
            the big 42px % and the identity block left almost nothing for
            the title on a phone. `sm:` restores the original single row,
            same 16px gaps throughout (the 24px gap ahead of the actions
            comes from this 16px plus the actions div's own marginLeft:8,
            exactly like before). */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4" style={{ marginBottom: 18 }}>
          <div className="flex items-center gap-4 flex-1 min-w-0">
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
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-4">
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

/* ─── Main Page ─────────────────────────────────────────────────── */
export default function WarehousesPage() {
  const router = useRouter();

  const [stats, setStats]     = useState<WarehouseStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<WarehouseStat | null>(null);
  const [form, setForm]       = useState(emptyForm);
  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm] = useState(emptyForm);
  const [saving, setSaving]   = useState(false);
  // Mirrors /inventory's own "Не відображати не введені позиції" toggle —
  // same localStorage key (HIDE_UNENTERED_KEY there), so switching it on
  // either page shows a consistent picture: the fill %/counts on these
  // banners come from warehouse_stats_entered (only rows actually manually
  // entered at least once) instead of warehouse_stats (every row,
  // including thousands of never-touched auto-inserted ones) — see
  // scripts/create-warehouse-stats-entered-view.sql for why that split
  // exists. Starts false on the server-rendered pass (matches SSR/CSR
  // markup), synced from localStorage right after mount, same pattern
  // /inventory's own toggle already uses.
  const [hideUnentered, setHideUnentered] = useState(false);
  // Gates the very first load() until the localStorage read below has had
  // a chance to run — without this, the effect below fires once with the
  // default `false` and again right after with the real value once
  // setHideUnentered resolves it, two in-flight fetches racing each other.
  // Whichever response happened to land second silently overwrote the
  // other's `stats`, occasionally leaving the entered-only numbers
  // clobbered back to the full-warehouse ones a moment after the toggle
  // should have applied. Same race class as the /orders status-filter fix
  // elsewhere in this app — see that page's own comment.
  const [prefsReady, setPrefsReady] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("inventory-hide-unentered") === "1") setHideUnentered(true);
    setPrefsReady(true);
  }, []);

  async function load(entered: boolean) {
    setLoading(true);
    const res = await fetch(`/api/warehouses/stats${entered ? "?entered=1" : ""}`);
    const data = await res.json();
    setStats(Array.isArray(data) ? data : []);
    setLoading(false);
  }
  useEffect(() => {
    if (!prefsReady) return;
    load(hideUnentered);
  }, [prefsReady, hideUnentered]);

  async function saveEdit() {
    if (!editRow) return;
    setSaving(true);
    const res = await fetch(`/api/warehouses/${editRow.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (res.ok) { toast.success("Збережено"); setEditRow(null); load(hideUnentered); }
    else { const e = await res.json(); toast.error(e.error); }
  }

  async function deleteRow(id: number) {
    if (!confirm("Видалити склад?")) return;
    const res = await fetch(`/api/warehouses/${id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Видалено"); load(hideUnentered); }
    else toast.error("Помилка");
  }

  async function createWarehouse() {
    if (!newForm.title.trim()) { toast.error("Вкажіть назву"); return; }
    setSaving(true);
    const res = await fetch("/api/warehouses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newForm) });
    setSaving(false);
    if (res.ok) { toast.success("Склад створено"); setShowCreate(false); setNewForm(emptyForm); load(hideUnentered); }
    else { const e = await res.json(); toast.error(e.error); }
  }

  const InlineForm = ({ f, setF, onSave, onCancel, label }: any) => (
    <div className="crm-card animate-scale-in" style={{ padding: 20, marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>{label}</h3>
      <div className="grid grid-cols-1 sm:[grid-template-columns:1fr_1fr_100px_140px_auto] gap-3">
        <div><label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Назва *</label><input className="crm-input" value={f.title} onChange={(e: any) => setF({ ...f, title: e.target.value })} /></div>
        <div><label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Адреса</label><input className="crm-input" value={f.address} onChange={(e: any) => setF({ ...f, address: e.target.value })} /></div>
        <div><label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Порядок</label><input className="crm-input" type="number" value={f.priority} onChange={(e: any) => setF({ ...f, priority: Number(e.target.value) })} /></div>
        <div className="flex items-end pb-1"><label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13 }}><input type="checkbox" checked={f.active === 1} onChange={(e: any) => setF({ ...f, active: e.target.checked ? 1 : 0 })} /> Активний</label></div>
        <div className="flex gap-1.5">
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
        // Label hidden below `sm` (matching the same fix on /inventory) —
        // the full-width button otherwise left almost no room for the
        // title/subtitle, hiding "Склади" behind it entirely on a phone.
        actions={<button className="btn-primary" onClick={() => setShowCreate(true)}><Plus size={14} /> <span className="hidden sm:inline">Новий склад</span></button>}
      />

      <div className="page-content p-4 md:p-6" style={{ flex: 1 }}>

        {hideUnentered && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
              padding: "8px 14px", borderRadius: 8, fontSize: 12.5,
              background: "rgba(99,102,241,0.1)", color: "var(--accent)",
            }}
          >
            Показано без урахування не введених позицій — як у «Не відображати не введені позиції» на сторінці Залишків.
          </div>
        )}

        {/* ── Inline forms (edit / create) ── */}
        {showCreate && <InlineForm f={newForm} setF={setNewForm} onSave={createWarehouse} onCancel={() => { setShowCreate(false); setNewForm(emptyForm); }} label="Новий склад" />}
        {editRow    && <InlineForm f={form}    setF={setForm}    onSave={saveEdit}        onCancel={() => setEditRow(null)} label={`Редагувати: ${editRow.title}`} />}

        {loading ? (
          <div style={{ padding: 64, textAlign: "center", color: "var(--text-muted)" }}>Завантаження...</div>
        ) : stats.length === 0 ? (
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
                // "Вже адаптована" per its own mobile card list — clicking a
                // warehouse used to switch to an in-page tab rendering a
                // second, un-adapted copy of this same inventory table.
                // /inventory does the exact same job with a real mobile
                // layout, so this just deep-links there instead.
                onOpenInventory={(id) => router.push(`/inventory?warehouse_id=${id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
