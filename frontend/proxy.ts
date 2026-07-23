import { withAuth } from "next-auth/middleware";
import { serverApiUrl } from "./app/lib/api-server";

export default withAuth({
  callbacks: {
    authorized: async ({ token, req }) => {
      const pathname = req.nextUrl.pathname;
      if (pathname.startsWith("/admin")) {
        if (!token?.accessToken) return false;
        try {
          const response = await fetch(serverApiUrl("/me"), {
            headers: { Authorization: `Bearer ${token.accessToken}` },
            cache: "no-store",
          });
          if (!response.ok) return false;
          const current = await response.json() as { user?: { role?: string } };
          return current.user?.role === "ADMIN";
        } catch {
          return false;
        }
      }
      return Boolean(token);
    },
  },
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/admin/:path*",
    "/account/:path*",
    "/dashboard/:path*",
    "/surveillance/:path*",
    "/organisms/:organismId/genome",
    "/submit-organism/:path*",
    "/blog/create/:path*",
  ],
};
