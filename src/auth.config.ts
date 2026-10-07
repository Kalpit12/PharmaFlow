import type { UserRole } from "@prisma/client";
import type { NextAuthConfig } from "next-auth";

import { resolveRoleForPermissions } from "@/lib/auth/permissions";

/**
 * Shared Auth.js config without credential providers or database imports.
 * Used by `@/auth` (sign-in API + proxy). Never duplicate NextAuth() elsewhere.
 */
export const authConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.tenantId = user.tenantId;
        token.role = user.role;
        if (typeof user.email === "string") token.email = user.email;
      }
      return token;
    },
    session({ session, token }) {
      const role = token.role;
      if (
        session.user &&
        typeof token.id === "string" &&
        typeof token.tenantId === "string" &&
        typeof role === "string" &&
        resolveRoleForPermissions(role)
      ) {
        session.user.id = token.id;
        session.user.tenantId = token.tenantId;
        session.user.role = role as UserRole;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
