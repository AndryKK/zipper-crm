import { Header } from "@/components/admin/header";
import { supabaseServer } from "@/lib/supabase";
import { CategoryForm } from "../category-form";

export const dynamic = "force-dynamic";

export default async function NewCategoryPage({
  searchParams,
}: {
  searchParams: Promise<{ pid?: string }>;
}) {
  const sp = await searchParams;
  const initialPid = sp.pid ? parseInt(sp.pid) : 0;

  // Fetch all UK categories so any level can be chosen as parent
  const { data } = await supabaseServer
    .from("categories")
    .select("id, translationId:translation_id, pid, title")
    .eq("lang", "uk")
    .order("pid", { ascending: true })
    .order("priority", { ascending: true });

  const allCats = (data || []) as any[];

  // Build ordered list: roots first, then children recursively (for indented select)
  const childrenOf = (pid: number) => allCats.filter((c) => c.pid === pid);
  const ordered: any[] = [];
  function collect(pid: number, depth: number) {
    for (const cat of childrenOf(pid)) {
      ordered.push({ ...cat, _depth: depth });
      collect(cat.translationId, depth + 1);
    }
  }
  collect(0, 0);

  return (
    <>
      <Header title={initialPid ? "Нова підкатегорія" : "Нова категорія"} />
      <CategoryForm parentCategories={ordered} initialPid={initialPid} />
    </>
  );
}
