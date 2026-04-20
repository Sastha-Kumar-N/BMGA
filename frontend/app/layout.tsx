import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "./context/AuthProvider";
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* We use a separate AuthProvider to keep this file as a Server Component */}
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}