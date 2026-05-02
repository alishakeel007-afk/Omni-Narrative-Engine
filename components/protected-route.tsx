"use client";

import type { Route } from "next";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!currentUser) {
      router.replace(`/auth?next=${encodeURIComponent(pathname)}` as Route);
    }
  }, [currentUser, loading, pathname, router]);

  if (loading || !currentUser) {
    return (
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl">
          <div className="glass-panel rounded-[2rem] p-8 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">
              Authentication
            </p>
            <h1 className="mt-3 font-[var(--font-heading)] text-3xl text-white">
              Checking access...
            </h1>
            <p className="mt-4 text-sm leading-7 text-white/68">
              Securing your story session and validating account access.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return <>{children}</>;
}
