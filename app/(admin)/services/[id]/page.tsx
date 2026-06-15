import { supabaseServer } from "@/lib/supabase";
import { notFound } from "next/navigation";
import { Header } from "@/components/admin/header";
import { ServiceForm } from "../service-form";

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: service } = await supabaseServer.from("services").select("*").eq("id", parseInt(id)).single();
  if (!service) notFound();
  return (
    <>
      <Header title={(service as any).title} />
      <ServiceForm service={service as any} />
    </>
  );
}
