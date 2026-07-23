import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import { serverApiUrl } from "@/app/lib/api-server";

const isProduction = process.env.NODE_ENV === "production";
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";
const allowInsecureDevSecrets = process.env.ALLOW_INSECURE_DEV_SECRETS === "true";
const sessionSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
const nextAuthUrl = process.env.NEXTAUTH_URL || "";
const useSecureCookies = nextAuthUrl.toLowerCase().startsWith("https://");
const unsafeSessionSecret = !sessionSecret
  || sessionSecret.length < 32
  || ["change-me", "change-me-in-production", "dev-secret-change-me", "secret"].includes(sessionSecret)
  || /^dev-local-/i.test(sessionSecret);

if (isProduction && !isProductionBuild && !allowInsecureDevSecrets && unsafeSessionSecret) {
  throw new Error("NEXTAUTH_SECRET or AUTH_SECRET must be set to a strong non-placeholder value in production.");
}

if (isProduction && !isProductionBuild && !allowInsecureDevSecrets && !useSecureCookies) {
  throw new Error("NEXTAUTH_URL must use https:// in production so session cookies are secure.");
}

type LoginResponse = {
  token?: string;
  user?: {
    id: string;
    email?: string;
    name?: string | null;
    role?: string;
    affiliation?: string;
  };
};

type CurrentUserResponse = {
  user?: LoginResponse["user"];
};

const ROLE_REFRESH_INTERVAL_MS = 5_000;

const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Genomics Account",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        const res = await fetch(serverApiUrl("/auth/login"), {
          method: 'POST',
          body: JSON.stringify({
            email: credentials.email,
            password: credentials.password,
          }),
          headers: { "Content-Type": "application/json" }
        });

        const data = await res.json() as LoginResponse;

        if (res.ok && data.user && data.token) {
          return {
            id: data.user.id,
            name: data.user.name,
            email: data.user.email || credentials.email,
            role: data.user.role,
            affiliation: data.user.affiliation,
            accessToken: data.token,
          };
        }
        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.accessToken = user.accessToken;
        token.role = user.role;
        token.affiliation = user.affiliation;
        token.roleSyncedAt = Date.now();
        token.authSyncError = undefined;
      }

      const shouldRefreshCurrentUser = Boolean(
        token.accessToken
        && (trigger === "update" || !token.roleSyncedAt || Date.now() - token.roleSyncedAt >= ROLE_REFRESH_INTERVAL_MS),
      );
      if (shouldRefreshCurrentUser) {
        try {
          const response = await fetch(serverApiUrl("/me"), {
            headers: { Authorization: `Bearer ${token.accessToken}` },
            cache: "no-store",
          });
          if (!response.ok) {
            token.authSyncError = response.status === 401 ? "SESSION_EXPIRED" : "ROLE_SYNC_FAILED";
          } else {
            const current = await response.json() as CurrentUserResponse;
            if (current.user) {
              token.id = current.user.id;
              token.name = current.user.name;
              token.email = current.user.email;
              token.role = current.user.role;
              token.affiliation = current.user.affiliation;
              token.authSyncError = undefined;
            }
          }
        } catch {
          token.authSyncError = "ROLE_SYNC_FAILED";
        } finally {
          token.roleSyncedAt = Date.now();
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.accessToken = token.accessToken;
        session.user.role = token.role;
        session.user.affiliation = token.affiliation;
      }
      session.authSyncError = token.authSyncError;
      return session;
    }
  },
  session: {
    strategy: "jwt",
    maxAge: Number(process.env.SESSION_MAX_AGE_SECONDS || 60 * 60 * 8),
    updateAge: Number(process.env.SESSION_UPDATE_AGE_SECONDS || 60 * 15),
  },
  cookies: {
    sessionToken: {
      name: useSecureCookies ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  secret: sessionSecret || "local-development-session-secret-minimum-32-chars",
  pages: {
    signIn: '/login',
  }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
