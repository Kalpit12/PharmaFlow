import type { UserRole } from "@prisma/client";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";

import { isTenantAccessible } from "@/lib/auth/identity";
import { getPrisma } from "@/lib/server/db";
import { verifyPassword } from "@/lib/server/password";

class InactiveAccountError extends CredentialsSignin {
  code = "inactive_account";
}

class InactiveTenantError extends CredentialsSignin {
  code = "inactive_tenant";
}

export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = typeof credentials.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const user = await getPrisma().user.findUnique({
          where: { email },
          include: { tenant: true },
        });

        if (!user?.passwordHash) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        if (user.status !== "ACTIVE") throw new InactiveAccountError();
        if (!isTenantAccessible(user.tenant.status)) throw new InactiveTenantError();

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          tenantId: user.tenantId,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.tenantId = user.tenantId;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      const role = token.role;
      if (
        session.user &&
        typeof token.id === "string" &&
        typeof token.tenantId === "string" &&
        (role === "ADMIN" || role === "MANAGER" || role === "OPERATOR" || role === "VIEWER")
      ) {
        session.user.id = token.id;
        session.user.tenantId = token.tenantId;
        session.user.role = role satisfies UserRole;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
