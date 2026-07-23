import { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    authSyncError?: string;
    user?: {
      id?: string;
      role?: string;
      affiliation?: string;
      accessToken?: string;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role?: string;
    affiliation?: string;
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    affiliation?: string;
    accessToken?: string;
    roleSyncedAt?: number;
    authSyncError?: string;
  }
}
