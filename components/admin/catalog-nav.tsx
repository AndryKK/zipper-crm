"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";

type CatalogChild = { id: number; title: string };
export type CatalogRoot = { id: number; title: string; children: CatalogChild[] };

export function CatalogNav({ roots }: { roots: CatalogRoot[] }) {
  const [expanded, setExpanded] = useState<number[]>([]);

  const toggle = (id: number) =>
    setExpanded((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const linkStyle = {
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 8px 5px 40px",
    fontSize: 12,
    color: "rgba(148,163,184,0.8)",
    textDecoration: "none" as const,
    borderRadius: 6,
    margin: "1px 8px",
    transition: "all 0.12s",
  };

  return (
    <div style={{ marginTop: 2 }}>
      <Link href="/products" style={linkStyle}
        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#c7d2fe"; (e.currentTarget as HTMLAnchorElement).style.background = "rgba(99,102,241,0.1)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(148,163,184,0.8)"; (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
      >
        — всі товари
      </Link>
      <Link href="/products?cat=0" style={linkStyle}
        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#c7d2fe"; (e.currentTarget as HTMLAnchorElement).style.background = "rgba(99,102,241,0.1)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(148,163,184,0.8)"; (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
      >
        — без категорії
      </Link>

      {roots.map((root) => (
        <div key={root.id}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <button
              onClick={() => toggle(root.id)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 8px 5px 32px",
                fontSize: 12,
                color: "rgba(148,163,184,0.85)",
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left" as const,
                borderRadius: 6,
                margin: "1px 8px 1px 0",
                transition: "all 0.12s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#c7d2fe";
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(99,102,241,0.1)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "rgba(148,163,184,0.85)";
                (e.currentTarget as HTMLButtonElement).style.background = "none";
              }}
            >
              {expanded.includes(root.id) ? (
                <ChevronDown size={11} />
              ) : (
                <ChevronRight size={11} />
              )}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {root.title}
              </span>
            </button>
            <Link
              href={`/products/new?cat=${root.id}`}
              style={{
                flexShrink: 0,
                padding: "5px 8px",
                color: "rgba(165,180,252,0.3)",
                borderRadius: 4,
                transition: "all 0.12s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "#10b981";
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(16,185,129,0.1)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "rgba(165,180,252,0.3)";
                (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
              }}
            >
              <Plus size={11} />
            </Link>
          </div>

          {expanded.includes(root.id) && (
            <div>
              {root.children.length === 0 ? (
                <Link
                  href={`/products?cat=${root.id}`}
                  style={{ ...linkStyle, paddingLeft: 52 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#c7d2fe"; (e.currentTarget as HTMLAnchorElement).style.background = "rgba(99,102,241,0.1)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(148,163,184,0.8)"; (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
                >
                  — товари категорії
                </Link>
              ) : (
                root.children.map((child) => (
                  <div key={child.id} style={{ display: "flex", alignItems: "center" }}>
                    <Link
                      href={`/products?cat=${child.id}`}
                      style={{ ...linkStyle, flex: 1, paddingLeft: 52, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#c7d2fe"; (e.currentTarget as HTMLAnchorElement).style.background = "rgba(99,102,241,0.1)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(148,163,184,0.8)"; (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
                    >
                      {child.title}
                    </Link>
                    <Link
                      href={`/products/new?cat=${child.id}`}
                      style={{
                        flexShrink: 0,
                        padding: "5px 8px",
                        color: "rgba(165,180,252,0.3)",
                        borderRadius: 4,
                        transition: "all 0.12s",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.color = "#10b981";
                        (e.currentTarget as HTMLAnchorElement).style.background = "rgba(16,185,129,0.1)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.color = "rgba(165,180,252,0.3)";
                        (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                      }}
                    >
                      <Plus size={11} />
                    </Link>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
