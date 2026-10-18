import type { Metadata } from "next";
import { Cinzel, Manrope } from "next/font/google";
import "./globals.css";
import "./public.css";
import { AuthProvider } from "@/context/AuthContext";
import { StoryProvider } from "@/context/StoryContext";
import { Navbar } from "@/components/navbar";
import { TaskQueueManager } from "@/components/task-queue-manager";

const heading = Cinzel({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["500", "700"],
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "OmniNarrative — Your creative director partner",
  description:
    "Your creative director partner, from first idea to final film. Explore stories, create characters and scenes, and bring it all together in one studio.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body className="font-[var(--font-body)]">
        <AuthProvider>
          <StoryProvider>
            <TaskQueueManager />
            <div className="pointer-events-none fixed inset-0 story-grid opacity-40" />
            <Navbar />
            <main className="relative z-10">{children}</main>
          </StoryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
