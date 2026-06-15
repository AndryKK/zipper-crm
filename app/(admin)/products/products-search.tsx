"use client";
import { Input } from "@/components/ui/input";
import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Search } from "lucide-react";

export function ProductsSearch({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="relative max-w-xs">
      <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
      <Input
        defaultValue={defaultValue}
        placeholder="Пошук за назвою або артикулом..."
        className="pl-9"
        onChange={(e) => {
          const val = e.target.value;
          startTransition(() => {
            const params = new URLSearchParams(window.location.search);
            params.delete("page");
            if (val) params.set("q", val);
            else params.delete("q");
            router.push(`${pathname}?${params.toString()}`);
          });
        }}
      />
      {isPending && (
        <div className="absolute right-3 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      )}
    </div>
  );
}
