import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./public.css";
import { AuthProvider } from "@/context/AuthContext";
import { StoryProvider } from "@/context/StoryContext";
import { Navbar } from "@/components/navbar";
import { TaskQueueManager } from "@/components/task-queue-manager";

const body = localFont({
  src: "../public/fonts/Manrope.ttf",
  variable: "--font-body",
  display: "swap",
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
    <html lang="en" className={body.variable}>
      <body className="font-[var(--font-body)]">
        <AuthProvider>
          <StoryProvider>
            <TaskQueueManager />
            <Navbar />
            <main className="relative z-10">{children}</main>
          </StoryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
