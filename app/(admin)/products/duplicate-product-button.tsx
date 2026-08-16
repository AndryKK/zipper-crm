"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";

// One-click "Копіювати товар": creates a new UK+RU pair linked to this
// product as another color (same mechanism the "Додати колір" flow in
// product-form.tsx uses — POST /api/products/[id]/colors), copying every
// field except photos. There's no form here to fill in an артикул/slug, so
// both are auto-generated server-side (see lib/products.ts and that
// route's doc comment for exactly how); no extra list-page query needed
// for that, keeping this egress-light. Navigates straight to the new
// product's edit page (its "uk" variant) once created — there's nothing
// useful to look at on the list page for a product with no photos yet.
export function DuplicateProductButton({ productId }: { productId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/products/${productId}/colors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Не вдалося скопіювати товар"); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ukVariant = (data.newVariants ?? []).find((v: any) => v.lang === "uk") ?? data.newVariants?.[0];
      if (!ukVariant) { toast.error("Товар скопійовано, але не вдалося відкрити нову версію"); return; }
      toast.success(`Товар скопійовано (${ukVariant.pcode})`);
      router.push(`/products/${ukVariant.id}`);
    } catch {
      toast.error("Помилка з'єднання");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      title="Копіювати товар — новий колір цього ж товару (без фото)"
      className="inline-flex items-center justify-center h-8 w-8 rounded-md text-gray-400 hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50 disabled:cursor-wait"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
