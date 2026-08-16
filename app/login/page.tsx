import { LoginForm } from "./login-form";

// LoginForm (client component) calls useSearchParams() to read ?error=...
// (see its own comment for why that's needed), which Next requires a
// Suspense boundary for during static generation — force-dynamic exempts
// this route from that instead, same pattern as app/(admin)/users/page.tsx.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm />;
}
