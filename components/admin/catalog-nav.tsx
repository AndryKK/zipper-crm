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

  return (
    <div>
      <Link
        href="/products"
        className="block py-1 pl-11 pr-3 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
      >
        — всі товари
      </Link>
      <Link
        href="/products?cat=0"
        className="block py-1 pl-11 pr-3 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
      >
        — без категорії
      </Link>

      {roots.map((root) => (
        <div key={root.id}>
          <div className="flex items-center group">
            <button
              onClick={() => toggle(root.id)}
              className="flex flex-1 items-center gap-1.5 py-1 pl-9 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors text-left"
            >
              {expanded.includes(root.id) ? (
                <ChevronDown className="h-3 w-3 shrink-0" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">{root.title}</span>
            </button>
            <Link
              href={`/products/new?cat=${root.id}`}
              className="shrink-0 px-2 py-1 text-gray-300 hover:text-green-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Plus className="h-3 w-3" />
            </Link>
          </div>

          {expanded.includes(root.id) && (
            <div>
              {root.children.length === 0 ? (
                <Link
                  href={`/products?cat=${root.id}`}
                  className="block py-1 pl-14 pr-3 text-xs text-gray-400 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                >
                  — товари категорії
                </Link>
              ) : (
                root.children.map((child) => (
                  <div key={child.id} className="flex items-center group">
                    <Link
                      href={`/products?cat=${child.id}`}
                      className="flex-1 py-1 pl-14 pr-2 text-xs text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition-colors truncate"
                    >
                      {child.title}
                    </Link>
                    <Link
                      href={`/products/new?cat=${child.id}`}
                      className="shrink-0 px-2 py-1 text-gray-300 hover:text-green-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Plus className="h-3 w-3" />
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
