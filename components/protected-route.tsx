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
      <section className="mx-auto max-w-xl px-6 py-24 text-center">
        <p className="text-sm text-[var(--muted)]">Checking access…</p>
      </section>
    );
  }

  return <>{children}</>;
}
