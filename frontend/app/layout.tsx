import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import AuthProvider from "./context/AuthProvider";
import { BRAND_FULL_NAME } from "./lib/brand";

// Metadata stays here on the Server side
export const metadata: Metadata = {
  title: BRAND_FULL_NAME,
  description: "Bharat Microbial Genome Atlas microbial genomics repository, dashboard, and MAYA result portal.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {/* We use a separate AuthProvider to keep this file as a Server Component */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
