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
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg)",
      }}
    >
      <Sidebar catalogRoots={catalogRoots} />
      <main
        style={{
          flex: 1,
          marginLeft: 248,
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
        }}
      >
        {children}
      </main>
    </div>
  );
}
