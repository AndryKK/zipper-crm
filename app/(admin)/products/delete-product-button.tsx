"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

export function DeleteProductButton({ productId }: { productId: number }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center justify-center h-8 w-8 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      {confirming && (
        <ConfirmDialog
          message="Видалити товар?"
          destructive
          confirmLabel="Видалити"
          onConfirm={async () => {
            await fetch(`/api/products/${productId}`, { method: "DELETE" });
            window.location.reload();
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
