"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function WarehouseRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => { router.replace(`/warehouses?tab=${id}`); }, [id, router]);
  return null;
}
