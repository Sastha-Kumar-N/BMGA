'use client';

import { signOut, SessionProvider, useSession } from "next-auth/react";
import { useEffect } from "react";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={15} refetchOnWindowFocus>
      <SessionSecurityWatcher />
      {children}
    </SessionProvider>
  );
}

function SessionSecurityWatcher() {
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.authSyncError === "SESSION_EXPIRED") {
      void signOut({ callbackUrl: "/login?sessionExpired=1" });
    }
  }, [session?.authSyncError]);

  return null;
}
