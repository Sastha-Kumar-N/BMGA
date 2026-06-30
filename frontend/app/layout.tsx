import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import AuthProvider from "./context/AuthProvider";
import GlobalNavbar from "./components/GlobalNavbar";

// Metadata stays here on the Server side
export const metadata: Metadata = {
  title: "Genomic Platform",
  description: "Advanced bioinformatics repository",
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
          <GlobalNavbar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
