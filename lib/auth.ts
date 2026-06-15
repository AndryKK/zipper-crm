import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Логін", type: "text" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const user = await prisma.admUser.findUnique({
          where: { login: credentials.username as string },
        });

        if (!user) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.pass
        );
        if (!valid) return null;

        return { id: String(user.id), name: user.login, email: user.login };
      },
    }),
  ],
});
