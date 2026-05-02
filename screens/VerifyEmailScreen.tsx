"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import ScreenLayout from "@/screens/ScreenLayout";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { currentUser, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (currentUser) {
      router.replace("/dashboard");
      return;
    }

    router.replace("/auth");
  }, [currentUser, loading, router]);

  return (
    <ScreenLayout
      eyebrow="Account Status"
      title="Email Verification Is Not Required"
      description="This simplified prototype uses direct signup and login without an email verification step."
      maxWidth="max-w-lg"
    >
      <div className="glass-panel rounded-[2rem] p-8 text-center">
          <p className="text-xs uppercase tracking-[0.32em] text-starlight/80">Account Status</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl text-white">
            Email Verification Is Not Required
          </h1>
          <p className="mt-4 text-sm leading-7 text-white/68">
            This simplified prototype uses direct signup and login without an email verification step.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/auth"
              className="rounded-full border border-white/10 bg-white/5 px-6 py-4 text-sm font-semibold text-white/82 transition hover:border-gold/25 hover:bg-white/10"
            >
              Back to Login
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-6 py-4 text-sm font-semibold text-slate-950 transition hover:scale-[1.02]"
            >
              Create Account
            </Link>
          </div>
        </div>
    </ScreenLayout>
  );
}
