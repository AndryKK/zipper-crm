"use client";
import { Trash2 } from "lucide-react";

export function DeleteProductButton({ productId }: { productId: number }) {
  return (
    <button
      type="button"
      className="inline-flex items-center justify-center h-8 w-8 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
      onClick={async () => {
        if (!confirm("Видалити товар?")) return;
        await fetch(`/api/products/${productId}`, { method: "DELETE" });
        window.location.reload();
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
