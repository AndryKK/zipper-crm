"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, History } from "lucide-react";
import { apiFetch } from "@/lib/api";

type HistoryRow = {
  id: number;
  quantity_before: number;
  quantity_after: number;
  delta: number;
  source: string;
  changed_by: string | null;
  note: string | null;
  created_at: string;
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "Ручна зміна",
  order_created: "Нове замовлення",
  order_item_updated: "Зміна кількості в замовленні",
  order_item_deleted: "Видалення рядка замовлення",
  order_cancelled: "Скасування замовлення (до відправки)",
  order_uncancelled: "Скасування знято",
  return_received: "Повернення отримано на складі",
};

export function InventoryHistoryDialog({
  productId, warehouseId, children,
}: {
  productId: number;
  warehouseId: number;
  children: (open: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<HistoryRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch<HistoryRow[]>(`/api/inventory/history?product_id=${productId}&warehouse_id=${warehouseId}`)
      .then((data) => setRows(data ?? []))
      .finally(() => setLoading(false));
  }, [open, productId, warehouseId]);

  return (
    <>
      {children(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ maxWidth: 560 }}>
          <DialogHeader>
            <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <History size={16} /> Історія залишку
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div style={{ padding: 32, textAlign: "center" }}><Loader2 className="h-5 w-5 animate-spin" style={{ margin: "0 auto" }} /></div>
          ) : rows.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", padding: "12px 0" }}>Історії змін ще немає.</p>
          ) : (
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {rows.map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ flexShrink: 0, width: 92, fontFamily: "monospace", fontSize: 12.5 }}>
                    <span style={{ color: "var(--text-muted)" }}>{Number(r.quantity_before).toFixed(0)}</span>
                    {" → "}
                    <span style={{ fontWeight: 700 }}>{Number(r.quantity_after).toFixed(0)}</span>
                  </div>
                  <div style={{ flexShrink: 0, width: 52, textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: r.delta >= 0 ? "var(--success)" : "var(--danger)" }}>
                    {r.delta >= 0 ? "+" : ""}{Number(r.delta).toFixed(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5 }}>{SOURCE_LABEL[r.source] ?? r.source}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      {new Date(r.created_at).toLocaleString("uk-UA")} · {r.changed_by ?? "Система"}
                    </div>
                    {r.note && <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontStyle: "italic", marginTop: 2 }}>{r.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
