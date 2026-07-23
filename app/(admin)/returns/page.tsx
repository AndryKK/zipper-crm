"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import { RETURN_STATUS, RETURN_STATUSES, RETURN_STATUS_COLOR } from "@/lib/returns";
import { Loader2, ImageIcon, ExternalLink, Truck, Wallet } from "lucide-react";

type ReturnRow = {
  id: number;
  date: string;
  login: string | null;
  person: string | null;
  phone: string | null;
  reason: string | null;
  status: string | null;
  notes: string | null;
  title: string | null;
  quantity: string | null;
  photo: string | null;
  oid: number | null;
  product: number | null;
  qty: number | null;
  restocked: boolean;
  ttn: string | null;
  refunded: boolean;
  refunded_at: string | null;
};

type Product = { id: number; title: string; pcode: string | null };

export default function ReturnsPage() {
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [products, setProducts] = useState<Record<number, Product>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [linkDraft, setLinkDraft] = useState<Record<number, { product: string; qty: string }>>({});
  const [ttnDraft, setTtnDraft] = useState<Record<number, string>>({});
  const [checkingNpId, setCheckingNpId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/returns${statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ""}`);
    const data: ReturnRow[] = res.ok ? await res.json() : [];
    setRows(data);

    const productIds = [...new Set(data.map((r) => r.product).filter((p): p is number => !!p))];
    if (productIds.length) {
      const pres = await fetch(`/api/products?ids=${productIds.join(",")}`);
      // fall back silently if that query shape isn't supported — best effort
      if (pres.ok) {
        const pdata = await pres.json();
        const list: Product[] = Array.isArray(pdata) ? pdata : pdata.items ?? [];
        setProducts(Object.fromEntries(list.map((p) => [p.id, p])));
      }
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function setStatus(ret: ReturnRow, status: string) {
    setBusyId(ret.id);
    const draft = linkDraft[ret.id];
    const body: Record<string, unknown> = { status };
    if (status === RETURN_STATUS.RECEIVED && draft) {
      if (draft.product) body.product = draft.product;
      if (draft.qty) body.qty = draft.qty;
    }
    const res = await fetch(`/api/returns/${ret.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (!res.ok) { const e = await res.json(); toast.error(e.error ?? "Помилка"); return; }
    toast.success(`Статус: «${status}»`);
    load();
  }

  async function saveTtn(ret: ReturnRow) {
    const ttn = (ttnDraft[ret.id] ?? ret.ttn ?? "").trim();
    setBusyId(ret.id);
    const res = await fetch(`/api/returns/${ret.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttn }),
    });
    setBusyId(null);
    if (!res.ok) { const e = await res.json(); toast.error(e.error ?? "Помилка"); return; }
    toast.success("ТТН збережено");
    load();
  }

  async function toggleRefund(ret: ReturnRow) {
    setBusyId(ret.id);
    const res = await fetch(`/api/returns/${ret.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refunded: !ret.refunded }),
    });
    setBusyId(null);
    if (!res.ok) { const e = await res.json(); toast.error(e.error ?? "Помилка"); return; }
    toast.success(ret.refunded ? "Позначено як не повернуто" : "Гроші повернено клієнту");
    load();
  }

  async function checkNp(ret: ReturnRow) {
    setCheckingNpId(ret.id);
    try {
      const res = await fetch(`/api/cron/sync-ttn-status?returnId=${ret.id}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Помилка"); return; }
      const entry = data.returnLog?.[0];
      if (!entry) { toast.info("Нема ТТН для перевірки"); return; }
      if (entry.error) { toast.error(entry.error); return; }
      if (entry.delivered) { toast.success("Нова Пошта підтвердила отримання — статус оновлено"); load(); }
      else { toast.info(`Статус НП: ${entry.status || "ще в дорозі"}`); }
    } catch { toast.error("Помилка з'єднання"); }
    finally { setCheckingNpId(null); }
  }

  return (
    <>
      <Header title="Повернення" />
      <div className="p-6 space-y-4">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => setStatusFilter("")}
            className={statusFilter === "" ? "badge badge-blue" : "badge badge-gray"}
            style={{ cursor: "pointer", border: "none" }}
          >
            Усі
          </button>
          {RETURN_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                cursor: "pointer", border: "none", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                background: statusFilter === s ? RETURN_STATUS_COLOR[s] : "rgba(148,163,184,0.15)",
                color: statusFilter === s ? "#fff" : "var(--text-muted)",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: "center" }}><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="crm-card" style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>
            Повернень немає
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const product = r.product ? products[r.product] : null;
              const needsLink = !r.product || !r.qty;
              const draft = linkDraft[r.id] ?? { product: r.product ? String(r.product) : "", qty: r.qty ? String(r.qty) : "" };

              return (
                <div key={r.id} className="crm-card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>#{r.id}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, color: "#fff", background: RETURN_STATUS_COLOR[r.status ?? RETURN_STATUS.NEW] ?? "#6b7280" }}>
                          {r.status ?? RETURN_STATUS.NEW}
                        </span>
                        {r.restocked && <span className="badge badge-green">Зараховано на склад</span>}
                        {r.oid && <Link href={`/orders/${r.oid}`} style={{ fontSize: 12, color: "#6366f1", display: "inline-flex", alignItems: "center", gap: 3 }}>Замовлення #{r.oid} <ExternalLink size={11} /></Link>}
                      </div>
                      <div style={{ fontWeight: 600 }}>{r.person ?? r.login ?? "—"}</div>
                      <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{r.phone}</div>
                      <div style={{ marginTop: 6, fontSize: 13 }}>
                        {product ? (
                          <span>{product.title} {product.pcode && <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>({product.pcode})</span>} × {r.qty}</span>
                        ) : (
                          <span>{r.title ?? "—"} {r.quantity && <span style={{ color: "var(--text-muted)" }}>— {r.quantity}</span>}</span>
                        )}
                      </div>
                      {r.reason && <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>Причина: {r.reason}</div>}
                      {r.photo && (
                        <a href={r.photo} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#6366f1", marginTop: 4 }}>
                          <ImageIcon size={12} /> Фото
                        </a>
                      )}
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 6 }}>{formatDate(r.date)}</div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      {needsLink && r.status !== RETURN_STATUS.RECEIVED && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <Input
                            placeholder="ID товару" value={draft.product}
                            onChange={(e) => setLinkDraft((d) => ({ ...d, [r.id]: { ...draft, product: e.target.value } }))}
                            style={{ width: 90 }}
                          />
                          <Input
                            placeholder="К-сть" value={draft.qty}
                            onChange={(e) => setLinkDraft((d) => ({ ...d, [r.id]: { ...draft, qty: e.target.value } }))}
                            style={{ width: 70 }}
                          />
                        </div>
                      )}

                      {/* TTN of the parcel the customer ships back — distinct from the
                          order's own outgoing ttn. Once set, the sync-ttn-status cron
                          (and the manual check here) polls it and bumps the return to
                          ARRIVED when Nova Poshta reports it delivered. */}
                      {r.status !== RETURN_STATUS.RECEIVED && r.status !== RETURN_STATUS.REJECTED && r.status !== RETURN_STATUS.CANCELLED && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <Input
                            placeholder="ТТН повернення" value={ttnDraft[r.id] ?? r.ttn ?? ""}
                            onChange={(e) => setTtnDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                            style={{ width: 150 }}
                          />
                          <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => saveTtn(r)}>Зберегти</Button>
                          {r.ttn && (
                            <Button size="sm" variant="outline" disabled={checkingNpId === r.id} onClick={() => checkNp(r)} title="Перевірити статус НП">
                              {checkingNpId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck size={14} />}
                            </Button>
                          )}
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {(r.status === RETURN_STATUS.CONFIRMED || r.status === RETURN_STATUS.ARRIVED) && (
                          <Button
                            size="sm" variant={r.refunded ? "outline" : "default"} disabled={busyId === r.id}
                            onClick={() => toggleRefund(r)} style={{ gap: 6 }}
                          >
                            <Wallet size={14} /> {r.refunded ? "Гроші повернено" : "Повернути гроші"}
                          </Button>
                        )}
                        {r.status !== RETURN_STATUS.CONFIRMED && r.status !== RETURN_STATUS.ARRIVED && r.status !== RETURN_STATUS.RECEIVED && (
                          <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => setStatus(r, RETURN_STATUS.CONFIRMED)}>Підтвердити</Button>
                        )}
                        {r.status === RETURN_STATUS.CONFIRMED && (
                          <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => setStatus(r, RETURN_STATUS.ARRIVED)}>Прибуло на склад</Button>
                        )}
                        {r.status !== RETURN_STATUS.RECEIVED && (
                          <Button size="sm" disabled={busyId === r.id} onClick={() => setStatus(r, RETURN_STATUS.RECEIVED)}>
                            {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Отримано на складі"}
                          </Button>
                        )}
                        {r.status !== RETURN_STATUS.REJECTED && r.status !== RETURN_STATUS.RECEIVED && (
                          <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => setStatus(r, RETURN_STATUS.REJECTED)}>Відхилити</Button>
                        )}
                        {r.status !== RETURN_STATUS.CANCELLED && r.status !== RETURN_STATUS.RECEIVED && (
                          <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => setStatus(r, RETURN_STATUS.CANCELLED)}>Скасувати</Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
