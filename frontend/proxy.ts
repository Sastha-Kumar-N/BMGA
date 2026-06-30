import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ token, req }) => {
      const pathname = req.nextUrl.pathname;
      if (pathname.startsWith("/admin")) {
        return token?.role === "ADMIN";
      }
      if (pathname.startsWith("/review")) {
        return token?.role === "MODERATOR" || token?.role === "ADMIN";
      }
      return Boolean(token);
    },
  },
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: ["/admin/:path*", "/account/:path*", "/submit-organism/:path*", "/blog/create/:path*", "/review/:path*"],
};
