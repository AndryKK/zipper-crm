"use client";

import { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/admin/header";
import { Boxes, Search, Package, AlertTriangle } from "lucide-react";
import { InventoryHistoryDialog } from "@/components/admin/inventory-history-dialog";
import { Pagination } from "@/components/admin/data-table-controls";
import { getImgUrl } from "@/lib/utils";
import { Toggle, HIDE_UNENTERED_KEY } from "@/components/admin/toggle";

const PAGE_SIZE = 50;

interface LowStockRow {
  id: number;
  product_id: number;
  warehouse_id: number;
  quantity: number;
  min_quantity: number;
  product_pcode: string | null;
  product_img: string | null;
  displayTitle: string;
  warehouse_title: string;
  productUrl: string | null;
}

function ProductThumb({ img, size }: { img: string | null; size: number }) {
  const url = getImgUrl(img, "products");
  if (url) {
    return (
      <img
        src={url} alt=""
        style={{ width: size, height: size, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "var(--bg-secondary)" }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: 6, flexShrink: 0, background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Package size={size * 0.45} color="var(--text-muted)" />
    </div>
  );
}

function ProductTitleLink({ row, fontSize }: { row: LowStockRow; fontSize: number }) {
  if (!row.productUrl) {
    return <div style={{ fontWeight: 600, fontSize }}>{row.displayTitle}</div>;
  }
  return (
    <a
      href={row.productUrl}
      target="_blank" rel="noopener noreferrer"
      style={{ fontWeight: 600, fontSize, color: "inherit", textDecoration: "none" }}
      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
    >
      {row.displayTitle}
    </a>
  );
}

export default function LowStockPage() {
  const [rows, setRows] = useState<LowStockRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [hideUnentered, setHideUnentered] = useState(false);

  // Debounced — same 400ms as the main inventory page's own search.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 400);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => { setPage(1); }, [q, hideUnentered]);

  // Restore the toggle's saved state once mounted (kept out of the initial
  // useState so server-rendered and first-client-render markup still
  // match — reading localStorage during render would break that). Shares
  // its key with /inventory, so the preference carries over between pages.
  useEffect(() => {
    if (localStorage.getItem(HIDE_UNENTERED_KEY) === "1") setHideUnentered(true);
  }, []);

  function toggleHideUnentered(next: boolean) {
    setHideUnentered(next);
    localStorage.setItem(HIDE_UNENTERED_KEY, next ? "1" : "0");
  }

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set("q", q);
    if (hideUnentered) params.set("hide_unentered", "1");
    const res = await fetch(`/api/inventory/low-stock?${params}`);
    const data = await res.json();
    setRows(data.rows ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [page, q, hideUnentered]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <Header title="Товари під мінімумом" subtitle="Усі склади" />

      <div className="page-content" style={{ padding: "24px 28px", flex: 1 }}>
        <div className="crm-card" style={{ padding: 16, marginBottom: 20, maxWidth: 260 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Позицій під мінімумом</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--danger)" }}>{total.toLocaleString("uk-UA")}</div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center mb-4">
          <div className="relative w-full sm:w-auto" style={{ maxWidth: 360 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              className="crm-input w-full"
              style={{ paddingLeft: 34 }}
              placeholder="Пошук за назвою або кодом…"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>

          <Toggle
            checked={hideUnentered}
            onChange={toggleHideUnentered}
            label="Не відображати не введені позиції"
          />
        </div>

        {loading ? (
          <div className="crm-card" style={{ padding: 48, textAlign: "center", color: "var(--text-muted)" }}>Завантаження...</div>
        ) : rows.length === 0 ? (
          <div className="crm-card" style={{ padding: "64px 24px", textAlign: "center" }}>
            <Boxes size={32} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {q ? "Нічого не знайдено" : "Усі товари в межах мінімуму"}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {q ? "Спробуйте інший запит" : "Жодна позиція наразі не потребує поповнення"}
            </div>
          </div>
        ) : (
          <>
            {/* ── Desktop table (>= lg) ─────────────────────────────────── */}
            <div className="crm-card hidden lg:block" style={{ overflowX: "auto" }}>
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th>Склад</th>
                    <th style={{ textAlign: "right" }}>Поточний</th>
                    <th style={{ textAlign: "right" }}>Мінімум</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <ProductThumb img={row.product_img} size={36} />
                          <div>
                            <ProductTitleLink row={row} fontSize={13.5} />
                            {row.product_pcode && (
                              <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontFamily: "monospace" }}>
                                {row.product_pcode}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ color: "var(--text-muted)", fontSize: 12.5 }}>{row.warehouse_title}</td>
                      <td style={{ textAlign: "right" }}>
                        <InventoryHistoryDialog productId={row.product_id} warehouseId={row.warehouse_id}>
                          {(openHistory) => (
                            <button
                              onClick={openHistory}
                              title="Історія залишку"
                              style={{
                                fontFamily: "monospace", fontWeight: 700, color: "var(--danger)",
                                background: "none", border: "none", cursor: "pointer",
                                textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3,
                              }}
                            >
                              {Number(row.quantity).toFixed(0)}
                              <AlertTriangle size={11} style={{ marginLeft: 4, display: "inline" }} />
                            </button>
                          )}
                        </InventoryHistoryDialog>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span style={{ fontFamily: "monospace", color: "var(--text-muted)" }}>
                          {Number(row.min_quantity).toFixed(0)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Card list below 1024px ───────────────────────────────── */}
            <div className="lg:hidden flex flex-col gap-2.5">
              {rows.map((row) => (
                <div key={row.id} className="crm-card" style={{ padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                    <ProductThumb img={row.product_img} size={40} />
                    <div style={{ minWidth: 0 }}>
                      <ProductTitleLink row={row} fontSize={14} />
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
                        {row.product_pcode && <span style={{ fontFamily: "monospace" }}>{row.product_pcode}</span>}
                        {row.product_pcode && " · "}
                        {row.warehouse_title}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <InventoryHistoryDialog productId={row.product_id} warehouseId={row.warehouse_id}>
                      {(openHistory) => (
                        <button
                          onClick={openHistory}
                          style={{ padding: "8px 10px", borderRadius: 8, background: "var(--bg)", border: "none", cursor: "pointer", textAlign: "left" }}
                        >
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Поточний</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--danger)", display: "flex", alignItems: "center", gap: 4 }}>
                            {Number(row.quantity).toFixed(0)} <AlertTriangle size={13} />
                          </div>
                        </button>
                      )}
                    </InventoryHistoryDialog>
                    <div style={{ padding: "8px 10px", borderRadius: 8, background: "var(--bg)" }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Мінімум</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{Number(row.min_quantity).toFixed(0)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16 }}>
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
