"use client";

import { useState } from "react";

export function SortableTh({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
  align,
}: {
  label: string;
  sortKey: string;
  currentSort: string;
  currentDir: "asc" | "desc";
  onSort: (key: string) => void;
  align?: "right";
}) {
  const active = currentSort === sortKey;
  return (
    <th
      style={{ textAlign: align, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => onSort(sortKey)}
      title="Сортувати"
    >
      {label}
      <span
        style={{
          marginLeft: 4,
          fontSize: 10,
          color: active ? "var(--text)" : "var(--text-muted)",
          opacity: active ? 1 : 0.4,
        }}
      >
        {active ? (currentDir === "asc" ? "▲" : "▼") : "▲▼"}
      </span>
    </th>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const [jumpValue, setJumpValue] = useState("");

  if (totalPages <= 1) return null;

  function jump() {
    const n = parseInt(jumpValue, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      onChange(n);
      setJumpValue("");
    }
  }

  // Windowed page numbers: 1, ..., page-2..page+2, ..., last
  const windowSize = 2;
  const pageSet = new Set<number>([1, totalPages]);
  for (let p = page - windowSize; p <= page + windowSize; p++) {
    if (p > 1 && p < totalPages) pageSet.add(p);
  }
  const sorted = Array.from(pageSet).sort((a, b) => a - b);
  const withEllipsis: (number | "...")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) withEllipsis.push("...");
    withEllipsis.push(p);
    prev = p;
  }

  const btnStyle = (active = false): React.CSSProperties => ({
    padding: "5px 10px",
    fontSize: 12.5,
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: active ? "var(--accent)" : "transparent",
    color: active ? "#fff" : "var(--text)",
    cursor: "pointer",
    minWidth: 32,
  });

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
      <button
        className="btn-ghost"
        disabled={page <= 1}
        onClick={() => onChange(1)}
        style={{ padding: "6px 10px", opacity: page <= 1 ? 0.5 : 1 }}
        title="Перша сторінка"
      >
        « Перша
      </button>
      <button
        className="btn-ghost"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        style={{ padding: "6px 10px", opacity: page <= 1 ? 0.5 : 1 }}
      >
        ← Попередня
      </button>

      {withEllipsis.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} style={{ padding: "0 4px", color: "var(--text-muted)" }}>
            …
          </span>
        ) : (
          <button key={p} style={btnStyle(p === page)} onClick={() => onChange(p)}>
            {p}
          </button>
        )
      )}

      <button
        className="btn-ghost"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        style={{ padding: "6px 10px", opacity: page >= totalPages ? 0.5 : 1 }}
      >
        Наступна →
      </button>
      <button
        className="btn-ghost"
        disabled={page >= totalPages}
        onClick={() => onChange(totalPages)}
        style={{ padding: "6px 10px", opacity: page >= totalPages ? 0.5 : 1 }}
        title="Остання сторінка"
      >
        Остання »
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
        <input
          className="crm-input"
          style={{ width: 56, padding: "5px 6px", fontSize: 12.5, textAlign: "center" }}
          placeholder={String(page)}
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") jump();
          }}
        />
        <button className="btn-ghost" onClick={jump} style={{ padding: "5px 10px", fontSize: 12.5 }}>
          Перейти
        </button>
      </div>
    </div>
  );
}
