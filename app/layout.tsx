import type { Metadata } from "next";
import { Cinzel, Manrope } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { StoryProvider } from "@/context/StoryContext";
import { Navbar } from "@/components/navbar";

const heading = Cinzel({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["500", "700"]
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "Omni-Narrative Engine",
  description: "AI-powered multimedia storytelling frontend built with Next.js and Tailwind CSS."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="font-[var(--font-body)]">
        <AuthProvider>
          <StoryProvider>
            <div className="pointer-events-none fixed inset-0 story-grid opacity-20" />
            <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(111,92,255,0.25),transparent_65%)]" />
            <Navbar />
            <main className="relative z-10">{children}</main>
          </StoryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
