import { Sidebar } from "@/components/admin/sidebar";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const catRoots = await prisma.category.findMany({
    where: { lang: "uk", pid: 0 },
    orderBy: { priority: "asc" },
    select: { id: true, translationId: true, title: true },
  });

  const catChildren = await prisma.category.findMany({
    where: { lang: "uk", pid: { in: catRoots.map((r) => r.translationId) } },
    orderBy: { priority: "asc" },
    select: { id: true, translationId: true, title: true, pid: true },
  });

  const catalogRoots = catRoots.map((root) => ({
    id: root.translationId,
    title: root.title,
    children: catChildren
      .filter((c) => c.pid === root.translationId)
      .map((c) => ({ id: c.translationId, title: c.title })),
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
