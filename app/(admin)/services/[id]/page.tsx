import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Header } from "@/components/admin/header";
import { ServiceForm } from "../service-form";

export default async function EditServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const service = await prisma.service.findUnique({ where: { id: parseInt(id) } });
  if (!service) notFound();
  return (
    <>
      <Header title={service.title} />
      <ServiceForm service={service} />
    </>
  );
}
