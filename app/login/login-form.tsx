"use client";
import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, Loader2 } from "lucide-react";

// next-auth v5 beta's credentials signIn() is unreliable about *how* it
// reports "wrong username/password" despite `redirect: false`: sometimes
// it resolves { ok: false, error: "CredentialsSignin" }, sometimes it
// rejects the promise outright, and sometimes (observed here) it still
// does a real server redirect back to this page with ?error=... in the
// URL, which blows away all in-memory React state — a plain try/catch on
// the resolved/rejected promise alone can't see that third case, which is
// why the error message wasn't showing up. This checks all three.
const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Невірний логін або пароль",
};

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) setError(ERROR_MESSAGES[urlError] ?? "Невірний логін або пароль");
  }, [searchParams]);

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

      if (result?.ok && !result?.error) {
        router.push("/");
        router.refresh();
        return;
      }
      setError(ERROR_MESSAGES[result?.error ?? ""] ?? "Невірний логін або пароль");
    } catch (err) {
      // AuthError subclasses (CredentialsSignin, CallbackRouteError, ...)
      // carry the code in `.type`; anything else is a real connection
      // problem, not a wrong password.
      const type = (err as { type?: string })?.type;
      setError(ERROR_MESSAGES[type ?? ""] ?? (type ? "Невірний логін або пароль" : "Помилка з'єднання. Спробуйте ще раз."));
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
