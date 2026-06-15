"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import type { Category } from "@/app/generated/prisma";

type CategoryRowProps = {
  cat: Category;
  indent: number;
  ruId?: number;
};

export function CategoryRow({ cat, indent, ruId }: CategoryRowProps) {
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
    <tr className="border-t hover:bg-gray-50 transition-colors">
      <td className="px-3 py-2.5 text-gray-500 text-center">{cat.priority}</td>
      <td className="px-4 py-2.5">
        <span style={{ paddingLeft: `${indent * 1.25}rem` }}>
          {indent > 0 && <span className="text-gray-300 mr-1.5">└</span>}
          <span className="font-medium">{cat.title}</span>
          {discountLabel && (
            <span className="text-gray-400 text-xs ml-1">{discountLabel}</span>
          )}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center">
        {ruId != null && (
          <Link
            href={`/categories/${ruId}`}
            className="text-xs font-semibold text-blue-500 hover:text-blue-700"
          >
            RU
          </Link>
        )}
      </td>
      <td className="px-3 py-2.5 text-center">
        <Link href={`/categories/${cat.id}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </td>
      <td className="px-3 py-2.5 text-center">
        <button
          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          onClick={handleDelete}
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
