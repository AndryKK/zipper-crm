"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";

export function CategoryRow({ cat, indent, ruId }: { cat: any; indent: number; ruId?: number }) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm("Видалити категорію?")) return;
    await fetch(`/api/categories/${cat.id}`, { method: "DELETE" });
    router.refresh();
  };

  const discountLabel =
    cat.discount != null && cat.ndiscount != null
      ? ` [${cat.discount}% від ${cat.ndiscount} шт.]`
      : null;

  return (
    <tr>
      <td style={{ textAlign: "center" }}>{cat.priority}</td>
      <td>
        <span style={{ paddingLeft: `${indent * 1.25}rem` }}>
          {indent > 0 && <span style={{ color: "var(--text-muted)", marginRight: 6 }}>└</span>}
          <span style={{ fontWeight: 500 }}>{cat.title}</span>
          {discountLabel && (
            <span style={{ color: "var(--text-muted)", fontSize: 11.5, marginLeft: 4 }}>{discountLabel}</span>
          )}
        </span>
      </td>
      <td style={{ textAlign: "center" }}>
        {ruId != null && (
          <Link
            href={`/categories/${ruId}`}
            style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)" }}
          >
            RU
          </Link>
        )}
      </td>
      <td style={{ textAlign: "center" }}>
        <Link href={`/categories/${cat.id}`} className="btn-ghost" style={{ padding: "5px 8px" }}>
          <Pencil size={13} />
        </Link>
      </td>
      <td style={{ textAlign: "center" }}>
        <button
          className="btn-ghost"
          style={{ padding: "5px 8px", color: "var(--danger)" }}
          onClick={handleDelete}
          type="button"
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}
