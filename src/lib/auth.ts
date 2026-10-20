import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/schemas/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Самостоятельный хостинг: в прод-режиме Auth.js требует явного доверия хосту,
  // иначе UntrustedHost (500 на всех auth-вызовах)
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const user = await db.user.findUnique({ where: { email: parsed.data.email } });
        if (!user) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as "OWNER" | "EMPLOYEE",
          orgId: user.orgId,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: string }).role ?? "EMPLOYEE";
        token.orgId = (user as { orgId?: string }).orgId ?? "";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.role = (token.role as "OWNER" | "EMPLOYEE") ?? "EMPLOYEE";
        session.user.orgId = (token.orgId as string) ?? "";
      }
      return session;
    },
  },
});
