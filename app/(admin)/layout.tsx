import { Sidebar } from "@/components/admin/sidebar";
import { supabaseServer } from "@/lib/supabase";
import { unstable_cache } from "next/cache";

// This layout wraps every single admin page — the sidebar category fetch
// below ran on every navigation click anywhere in the CRM, not just once,
// since force-dynamic here made even nested pages with their own caching
// re-render this layout from scratch. Categories change rarely (an admin
// editing the catalog tree), so a few minutes of staleness here is
// unnoticeable but removes a query from every single click.
const getSidebarCategories = unstable_cache(
  async () => {
    const { data: allCats } = await supabaseServer
      .from("categories")
      .select("id, translation_id, title, pid")
      .eq("lang", "uk")
      .order("priority", { ascending: true });
    return allCats || [];
  },
  ["admin-sidebar-categories"],
  { revalidate: 300 }
);

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Fetch all UK categories for the sidebar tree (roots + up to 2 more levels)
  const cats = await getSidebarCategories();
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
