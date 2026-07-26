"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Same look/behaviour as <Pagination> in data-table-controls.tsx (first/prev/
// windowed page numbers/next/last + jump-to-page), but for server-rendered
// list pages that page via a URL search param instead of client state — the
// page itself stays a plain server component (no client-side fetch needed),
// only the pager is interactive.
//
// Takes basePath + a plain params object (not a hrefForPage callback) and
// builds each href itself: a Server Component can't hand a Client Component
// a function prop (only JSON-serializable values cross that boundary) — an
// arrow function passed in as hrefForPage blew up with exactly "An error
// occurred in the Server Components render" on every navigation.
export function UrlPagination({
  page,
  totalPages,
  basePath,
  params = {},
}: {
  page: number;
  totalPages: number;
  basePath: string;
  params?: Record<string, string | number | undefined>;
}) {
  const router = useRouter();
  const [jumpValue, setJumpValue] = useState("");

  if (totalPages <= 1) return null;

  function hrefForPage(p: number): string {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") usp.set(key, String(value));
    }
    usp.set("page", String(p));
    return `${basePath}?${usp.toString()}`;
  }

  function jump() {
    const n = parseInt(jumpValue, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      router.push(hrefForPage(n));
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
    display: "inline-block",
    textAlign: "center",
    textDecoration: "none",
  });

  const navStyle = (disabled: boolean): React.CSSProperties => ({
    padding: "6px 10px",
    opacity: disabled ? 0.5 : 1,
    pointerEvents: disabled ? "none" : "auto",
  });

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
      <Link className="btn-ghost" href={hrefForPage(1)} style={navStyle(page <= 1)} title="Перша сторінка" aria-disabled={page <= 1}>
        « Перша
      </Link>
      <Link className="btn-ghost" href={hrefForPage(Math.max(1, page - 1))} style={navStyle(page <= 1)} aria-disabled={page <= 1}>
        ← Попередня
      </Link>

      {withEllipsis.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} style={{ padding: "0 4px", color: "var(--text-muted)" }}>
            …
          </span>
        ) : (
          <Link key={p} href={hrefForPage(p)} style={btnStyle(p === page)}>
            {p}
          </Link>
        )
      )}

      <Link className="btn-ghost" href={hrefForPage(Math.min(totalPages, page + 1))} style={navStyle(page >= totalPages)} aria-disabled={page >= totalPages}>
        Наступна →
      </Link>
      <Link className="btn-ghost" href={hrefForPage(totalPages)} style={navStyle(page >= totalPages)} title="Остання сторінка" aria-disabled={page >= totalPages}>
        Остання »
      </Link>

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
