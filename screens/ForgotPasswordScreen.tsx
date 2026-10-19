"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import ScreenLayout from "@/screens/ScreenLayout";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function ForgotPasswordScreen() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    try {
      setIsSubmitting(true);
      await forgotPassword(email.trim());
      setMessage("If an account exists for this email, a reset link has been sent.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to send reset link.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenLayout
      eyebrow="Recovery"
      title="Reset Your Password"
      description="Enter your email and we'll record a reset request for this prototype flow."
      maxWidth="max-w-md"
    >
      <div className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--muted)]">Recovery</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl text-[var(--ink)]">
            Reset Your Password
          </h1>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
            Enter your email address and we will send a password reset link to your inbox.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block">
              <span className="mb-3 block text-sm font-semibold text-[var(--ink)]">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-[1.2rem] border border-[var(--line)] bg-black/20 px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--line)]"
                placeholder="you@example.com"
              />
            </label>

            {error ? (
              <div className="rounded-[1.2rem] border border-[var(--line)] bg-transparent px-4 py-3 text-sm font-medium text-[var(--ink)]">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="rounded-[1.2rem] border border-[var(--line)] bg-transparent px-4 py-3 text-sm font-medium text-[var(--ink)]">
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-[var(--accent)] px-6 py-4 text-sm font-semibold text-[var(--ink)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isSubmitting ? "Saving request..." : "Send Reset Link"}
            </button>
          </form>

          <div className="mt-6 text-sm text-[var(--muted)]">
            <Link href="/auth" className="text-[var(--ink)] transition hover:text-[var(--ink)]">
              Back to Login
            </Link>
          </div>
        </div>
    </ScreenLayout>
  );
}
