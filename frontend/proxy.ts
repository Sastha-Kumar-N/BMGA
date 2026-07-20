import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ token, req }) => {
      const pathname = req.nextUrl.pathname;
      if (pathname.startsWith("/admin")) {
        return token?.role === "ADMIN";
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
