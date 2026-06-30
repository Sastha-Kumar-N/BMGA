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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.accessToken = user.accessToken;
        token.role = user.role;
        token.affiliation = user.affiliation;
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
