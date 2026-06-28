import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "./context/AuthProvider";

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
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
