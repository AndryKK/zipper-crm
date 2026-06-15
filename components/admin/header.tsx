"use client";
import { useSession } from "next-auth/react";
import { User } from "lucide-react";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { data: session } = useSession();

  return (
    <header className="flex items-center justify-between border-b bg-white px-6 py-3 sticky top-0 z-20">
      <h1 className="text-xl font-semibold text-gray-800">{title}</h1>
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <User className="h-4 w-4" />
        {session?.user?.name ?? "Адмін"}
      </div>
    </header>
  );
}
