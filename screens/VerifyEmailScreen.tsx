"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import ScreenLayout from "@/screens/ScreenLayout";
import type { Route } from "next";
import { DEFAULT_AUTH_REDIRECT, getSafeRedirectPath } from "@/lib/auth-redirect";
import { StudioEntryNotice } from "@/components/public/studio-entry-notice";

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { currentUser, loading, refreshUser } = useAuth();
  const [next, setNext] = useState(DEFAULT_AUTH_REDIRECT);
  const [checked, setChecked] = useState(false);
  useEffect(() => { setNext(getSafeRedirectPath(new URLSearchParams(window.location.search).get("next"))); }, []);

  useEffect(() => {
    if (loading) return;

    if (currentUser) {
      router.replace(next as Route);
      return;
    }

  }, [currentUser, loading, next, router]);

  return (
    <ScreenLayout
      eyebrow="Account Status"
      title="Check your email"
      description="Confirm your email address to continue your story."
      maxWidth="max-w-lg"
    >
      <div className="glass-panel rounded-[2rem] p-8 text-center">
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--muted)]">Account Status</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl text-[var(--ink)]">
            Check your email
          </h1>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
            Open the confirmation link in the email from OmniNarrative. Your story idea and setup are saved in this browser.
          </p>
          <StudioEntryNotice nextPath={next} />
          <button type="button" className="guest-pill active mt-4" onClick={async () => {
            const user = await refreshUser(); if (user) router.replace(next as Route); else setChecked(true);
          }}>I’ve confirmed my email</button>
          {checked ? <p role="status" className="film-help">The session is not confirmed yet. Open the newest confirmation email, or sign in after confirming.</p> : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href={`/auth?next=${encodeURIComponent(next)}`}
              className="rounded-full border border-[var(--line)] bg-transparent px-6 py-4 text-sm font-semibold text-[var(--ink)]/82 transition hover:border-[var(--line)] hover:bg-black/[0.04]"
            >
              Back to Login
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-[var(--accent)] px-6 py-4 text-sm font-semibold text-[var(--ink)] transition hover:opacity-90"
            >
              Create Account
            </Link>
          </div>
        </div>
    </ScreenLayout>
  );
}
