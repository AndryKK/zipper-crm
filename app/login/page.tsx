"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const data = new FormData(e.currentTarget);
    try {
      const result = await signIn("credentials", {
        username: data.get("username"),
        password: data.get("password"),
        redirect: false,
      });

      if (result?.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      // signIn resolves (doesn't throw) for a wrong login/password — it
      // just comes back with ok:false/an error code instead. This is the
      // path that was silently doing nothing before: nothing ever called
      // setLoading(false), so the button's spinner just stuck around
      // forever with no error shown ("вічний логін") the moment `result`
      // itself came back falsy/malformed instead of a clean {ok:false}.
      setError("Невірний логін або пароль");
    } catch {
      // signIn can also reject outright (network blip, NextAuth/Supabase
      // error) — same fix applies: never leave the button spinning with
      // no feedback.
      setError("Помилка з'єднання. Спробуйте ще раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600">
              <Zap className="h-6 w-6 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl">Zipper CRM</CardTitle>
          <p className="text-sm text-gray-500">Система управління магазином</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Логін</Label>
              <Input id="username" name="username" required autoComplete="username" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Пароль</Label>
              <Input id="password" name="password" type="password" required autoComplete="current-password" />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Увійти
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
