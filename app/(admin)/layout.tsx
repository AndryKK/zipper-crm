import { Sidebar } from "@/components/admin/sidebar";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: catRoots } = await supabaseServer
    .from("categories")
    .select("id, translation_id, title")
    .eq("lang", "uk")
    .eq("pid", 0)
    .order("priority", { ascending: true });

  const roots = catRoots || [];
  const rootTransIds = roots.map((r: any) => r.translation_id);

  const { data: catChildren } = rootTransIds.length
    ? await supabaseServer
        .from("categories")
        .select("id, translation_id, title, pid")
        .eq("lang", "uk")
        .in("pid", rootTransIds)
        .order("priority", { ascending: true })
    : { data: [] };

  const children2 = catChildren || [];

  const catalogRoots = roots.map((root: any) => ({
    id: root.translation_id,
    title: root.title,
    children: children2
      .filter((c: any) => c.pid === root.translation_id)
      .map((c: any) => ({ id: c.translation_id, title: c.title })),
  }));

  return (
    <div className="flex h-full bg-gray-100 text-slate-900">
      <Sidebar catalogRoots={catalogRoots} />
      <main className="flex-1 ml-64 flex flex-col min-h-screen">
        {children}
      </main>
    </div>
  );
}
