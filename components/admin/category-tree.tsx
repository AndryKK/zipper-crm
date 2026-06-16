"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Pencil, Trash2, Package, Eye, EyeOff } from "lucide-react";

/* ─── Types ─── */
interface Cat {
  id: number;
  translation_id: number;
  pid: number;
  title: string;
  priority: number;
  visibility: number;
}

export interface CategoryTreeProps {
  categories: Cat[];
  productCounts: Record<number, number>;
}

/* ─── Helpers ─── */
function pluralUa(n: number) {
  const a = Math.abs(n);
  if (a % 10 === 1 && a % 100 !== 11) return `${n} товар`;
  if ([2, 3, 4].includes(a % 10) && ![12, 13, 14].includes(a % 100)) return `${n} товари`;
  return `${n} товарів`;
}

/* ─── Animated chevron (rotates on open) ─── */
function Caret({ open, size = 15 }: { open: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.24s cubic-bezier(0.4,0,0.2,1)",
        willChange: "transform",
        color: open ? "var(--accent)" : undefined,
      }}
    >
      <ChevronRight size={size} />
    </span>
  );
}

/* ─── Gradient icon square ─── */
const PALETTES = [
  { from: "#6366f1", to: "#8b5cf6" }, // indigo→violet  (root)
  { from: "#06b6d4", to: "#6366f1" }, // cyan→indigo    (level 1)
  { from: "#10b981", to: "#06b6d4" }, // emerald→cyan   (level 2+)
];

function IconBox({ depth, open }: { depth: number; open: boolean }) {
  const { from, to } = PALETTES[Math.min(depth, PALETTES.length - 1)];
  const sz = depth === 0 ? 34 : 27;
  const r  = depth === 0 ? 9 : 7;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: sz,
        height: sz,
        borderRadius: r,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        flexShrink: 0,
        boxShadow: open ? `0 3px 10px ${from}60` : "none",
        transition: "box-shadow 0.22s ease",
      }}
    >
      <svg
        width={depth === 0 ? 16 : 13}
        height={depth === 0 ? 16 : 13}
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(255,255,255,0.93)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 7a2 2 0 0 1 2-2h3.172a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 11.828 7H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      </svg>
    </span>
  );
}

/* ─── Smooth expand/collapse (CSS grid trick) ─── */
function Expandable({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 0.28s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      <div
        style={{
          overflow: "hidden",
          opacity: open ? 1 : 0,
          transition: "opacity 0.22s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ─── Delete button with confirm ─── */
function DelBtn({ cat, childCount, size = "md" }: { cat: Cat; childCount: number; size?: "sm" | "md" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const iconSize = size === "sm" ? 12 : 13;

  return (
    <button
      onClick={async () => {
        const msg =
          childCount > 0
            ? `Категорія "${cat.title}" має ${childCount} підкатегорій. Видалити?`
            : `Видалити категорію "${cat.title}"?`;
        if (!confirm(msg)) return;
        setBusy(true);
        await fetch(`/api/categories/${cat.id}`, { method: "DELETE" });
        setBusy(false);
        router.refresh();
      }}
      disabled={busy}
      className="cat-action cat-action--del"
      title="Видалити"
      style={{ opacity: busy ? 0.4 : 1 }}
    >
      <Trash2 size={iconSize} />
    </button>
  );
}

/* ─── Sub-level item (recursive, expandable if has children) ─── */
function SubItem({
  cat,
  categories,
  productCounts,
  depth,
}: {
  cat: Cat;
  categories: Cat[];
  productCounts: Record<number, number>;
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const children = categories.filter((c) => c.pid === cat.translation_id);
  const count = productCounts[cat.translation_id] ?? 0;
  const hasChildren = children.length > 0;

  return (
    <>
      <div className="cat-sub-row" style={{ paddingLeft: 15 + depth * 22 }}>
        {/* Expand toggle (only shown if has children) */}
        {hasChildren ? (
          <button
            className="cat-expand-btn"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            style={{ flexShrink: 0 }}
          >
            <Caret open={open} size={13} />
          </button>
        ) : (
          /* Connector dot for leaf items */
          <span
            aria-hidden
            style={{
              width: 26,
              height: 26,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--border)",
                display: "block",
              }}
            />
          </span>
        )}

        <IconBox depth={depth + 1} open={open} />

        {/* Title (click to expand if has children) */}
        {hasChildren ? (
          <button
            className="cat-toggle-area"
            onClick={() => setOpen((o) => !o)}
            style={{ cursor: "pointer" }}
          >
            <span className="cat-subtitle">{cat.title}</span>
            <span className="cat-meta" style={{ marginLeft: 6 }}>{children.length} підк.</span>
          </button>
        ) : (
          <span className="cat-subtitle">{cat.title}</span>
        )}

        {/* Badges */}
        <Link
          href={`/products?cat=${cat.translation_id}`}
          className="cat-badge cat-badge--products"
          title="Товари категорії"
        >
          <Package size={10} />
          {count}
        </Link>

        {cat.visibility === 0 && (
          <span className="cat-badge cat-badge--hidden" title="Прихована">
            <EyeOff size={10} />
          </span>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          <Link
            href={`/categories/${cat.id}`}
            className="cat-action cat-action--edit"
            title="Редагувати"
          >
            <Pencil size={12} />
          </Link>
          <Link
            href={`/categories/new?pid=${cat.translation_id}`}
            className="cat-action cat-action--add"
            title="Додати підкатегорію"
          >
            <Plus size={12} />
          </Link>
          <DelBtn cat={cat} childCount={children.length} size="sm" />
        </div>
      </div>

      {/* Recursive children */}
      {hasChildren && (
        <Expandable open={open}>
          <div style={{ borderTop: "1px solid var(--border)" }}>
            {children.map((child) => (
              <SubItem
                key={child.id}
                cat={child}
                categories={categories}
                productCounts={productCounts}
                depth={depth + 1}
              />
            ))}
            <div className="cat-add-footer" style={{ paddingLeft: 15 + (depth + 1) * 22 }}>
              <Link
                href={`/categories/new?pid=${cat.translation_id}`}
                className="cat-add-footer-link"
              >
                <Plus size={13} />
                Підкатегорію до &ldquo;{cat.title}&rdquo;
              </Link>
            </div>
          </div>
        </Expandable>
      )}
    </>
  );
}

/* ─── Root-level accordion card ─── */
function RootCard({
  cat,
  categories,
  productCounts,
}: {
  cat: Cat;
  categories: Cat[];
  productCounts: Record<number, number>;
}) {
  const [open, setOpen] = useState(false);
  const children = categories.filter((c) => c.pid === cat.translation_id);
  const count = productCounts[cat.translation_id] ?? 0;
  const toggle = () => setOpen((o) => !o);

  return (
    <div className={`cat-card${open ? " cat-card--open" : ""}`}>
      {/* ── Header ── */}
      <div className="cat-header">
        {/* Expand toggle button */}
        <button className="cat-expand-btn" onClick={toggle} aria-expanded={open}>
          <Caret open={open} />
        </button>

        {/* Icon + title clickable area */}
        <button className="cat-toggle-area" onClick={toggle}>
          <IconBox depth={0} open={open} />
          <span className="cat-title">{cat.title}</span>
          {children.length > 0 && (
            <span className="cat-meta" style={{ marginLeft: 4 }}>
              {children.length} підк.
            </span>
          )}
        </button>

        {/* Badges (non-toggle) */}
        <Link
          href={`/products?cat=${cat.translation_id}`}
          className="cat-badge cat-badge--products"
          title="Переглянути товари"
        >
          <Package size={11} />
          {pluralUa(count)}
        </Link>

        {cat.visibility === 1 && (
          <span className="cat-badge cat-badge--visible" title="Видима">
            <Eye size={11} />
          </span>
        )}
        {cat.visibility === 0 && (
          <span className="cat-badge cat-badge--hidden" title="Прихована">
            <EyeOff size={11} />
          </span>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 2, flexShrink: 0, marginLeft: 4 }}>
          <Link
            href={`/categories/${cat.id}`}
            className="cat-action cat-action--edit"
            title="Редагувати"
          >
            <Pencil size={13} />
          </Link>
          <Link
            href={`/categories/new?pid=${cat.translation_id}`}
            className="cat-action cat-action--add"
            title="Додати підкатегорію"
          >
            <Plus size={13} />
          </Link>
          <DelBtn cat={cat} childCount={children.length} />
        </div>
      </div>

      {/* ── Expandable body ── */}
      <Expandable open={open}>
        <div className="cat-body">
          {children.length === 0 ? (
            <p className="cat-empty-text">Підкатегорій немає</p>
          ) : (
            children.map((child) => (
              <SubItem
                key={child.id}
                cat={child}
                categories={categories}
                productCounts={productCounts}
                depth={0}
              />
            ))
          )}

          <div className="cat-add-footer">
            <Link
              href={`/categories/new?pid=${cat.translation_id}`}
              className="cat-add-footer-link"
            >
              <Plus size={14} />
              Додати підкатегорію до &ldquo;{cat.title}&rdquo;
            </Link>
          </div>
        </div>
      </Expandable>
    </div>
  );
}

/* ─── Main tree export ─── */
export function CategoryTree({ categories, productCounts }: CategoryTreeProps) {
  const roots = categories.filter((c) => c.pid === 0);

  if (roots.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 20px",
          color: "var(--text-muted)",
          textAlign: "center",
        }}
      >
        <span
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "var(--bg-hover)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 7a2 2 0 0 1 2-2h3.172a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 11.828 7H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
          </svg>
        </span>
        <p style={{ fontSize: 15, fontWeight: 600 }}>Категорій ще немає</p>
        <p style={{ fontSize: 13, marginTop: 6 }}>
          Натисніть «Додати категорію», щоб створити першу
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {roots.map((root) => (
        <RootCard
          key={root.id}
          cat={root}
          categories={categories}
          productCounts={productCounts}
        />
      ))}
    </div>
  );
}
