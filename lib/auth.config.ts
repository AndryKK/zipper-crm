import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token && session.user) (session.user as { id?: string }).id = token.id as string;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
