import { Sidebar } from "@/components/admin/sidebar";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Fetch all UK categories for the sidebar tree (roots + up to 2 more levels)
  const { data: allCats } = await supabaseServer
    .from("categories")
    .select("id, translation_id, title, pid")
    .eq("lang", "uk")
    .order("priority", { ascending: true });

  const cats = allCats || [];
  const roots = cats.filter((c: any) => c.pid === 0);

  const catalogRoots = roots.map((root: any) => ({
    id: root.translation_id,
    title: root.title,
    children: cats
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
