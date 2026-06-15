import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { Header } from "@/components/admin/header";
import { Button } from "@/components/ui/button";
import { Plus, Pencil } from "lucide-react";

export default async function ServicesPage() {
  const { data } = await supabaseServer.from("services").select("*").eq("lang", "uk").order("priority", { ascending: true });
  const items = (data || []) as any[];
  return (
    <>
      <Header title="Послуги" />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Всього: {items.length}</p>
          <Button asChild><Link href="/services/new"><Plus className="h-4 w-4 mr-2" />Додати послугу</Link></Button>
        </div>
        <div className="rounded-md border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium w-16">#</th>
                <th className="px-4 py-3 text-left font-medium">Назва</th>
                <th className="px-4 py-3 text-right font-medium w-24">Дії</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s: any) => (
                <tr key={s.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400">{s.priority}</td>
                  <td className="px-4 py-2 font-medium">{s.title}</td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/services/${s.id}`}><Pencil className="h-4 w-4" /></Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
