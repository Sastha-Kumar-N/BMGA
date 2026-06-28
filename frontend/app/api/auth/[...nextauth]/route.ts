import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";
import { serverApiUrl } from "@/app/lib/api-server";

type LoginResponse = {
  token?: string;
  user?: {
    id: string;
    name?: string | null;
    role?: string;
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
            email: credentials.email,
            role: data.user.role,
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
        token.accessToken = user.accessToken;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.accessToken = token.accessToken;
        session.user.role = token.role;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "dev-secret-change-me",
  pages: {
    signIn: '/login',
  }
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
