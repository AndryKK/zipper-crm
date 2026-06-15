import { supabaseServer } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { Header } from "@/components/admin/header";
import { NewsForm } from "../news-form";

export default async function EditNewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: news } = await supabaseServer.from("news").select("*").eq("id", parseInt(id)).single();
  if (!news) notFound();
  return (
    <>
      <Header title={(news as any).title} />
      <NewsForm news={news as any} />
    </>
  );
}
