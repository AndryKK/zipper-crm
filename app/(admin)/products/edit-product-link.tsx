"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { BusyOverlay } from "@/components/admin/busy-overlay";
import { Pencil } from "lucide-react";

// The product edit page loads every color variant's full data up front, so
// opening it can take a moment — this shows the same blocking loader used
// for sidebar navigation instead of leaving the list looking unresponsive.
export function EditProductLink({ productId }: { productId: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const href = `/products/${productId}`;

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    startTransition(() => router.push(href));
  }

  return (
    <>
      <Link href={href} onClick={handleClick}>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </Link>
      {isPending && <BusyOverlay label="Відкриваємо товар" />}
    </>
  );
}
