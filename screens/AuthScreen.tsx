"use client";

import Link from "next/link";
import type { Route } from "next";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { DEFAULT_AUTH_REDIRECT, getSafeRedirectPath } from "@/lib/auth-redirect";
import ScreenLayout from "@/screens/ScreenLayout";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function AuthScreen() {
  const router = useRouter();
  const { currentUser, loading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [nextPath, setNextPath] = useState(DEFAULT_AUTH_REDIRECT);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNextPath(getSafeRedirectPath(params.get("next")));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (currentUser) {
      router.replace(nextPath as Route);
    }
  }, [currentUser, loading, nextPath, router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    if (!password.trim()) {
      setError("Enter your password to continue.");
      return;
    }

    try {
      setIsSubmitting(true);
      await login(email.trim(), password);
      router.push(nextPath as Route);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to log in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenLayout
      eyebrow="Login"
      title="Return to Your Story"
      description="Log in to access your dashboard, continue saved stories, and manage your Omni-Narrative sessions."
      maxWidth="max-w-md"
    >
      <div className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.32em] text-starlight/80">Login</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl text-white">
            Return to Your Story
          </h1>
          <p className="mt-4 text-sm leading-7 text-white/90">
            Log in to access your dashboard, continue your saved story, and manage your AI-driven narrative sessions.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-gold/30"
                placeholder="you@example.com"
              />
            </Field>

            <Field label="Password">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 pr-12 text-sm text-white outline-none focus:border-gold/30"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/85"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            {error ? (
              <div className="rounded-[1.2rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-6 py-4 text-sm font-semibold text-slate-950 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isSubmitting ? "Logging in..." : "Login"}
            </button>
          </form>

          <div className="mt-6 flex flex-col gap-3 text-sm text-white/90 sm:flex-row sm:items-center sm:justify-between">
            <Link href={`/signup?next=${encodeURIComponent(nextPath)}` as Route} className="text-starlight transition hover:text-gold">
              Create an account
            </Link>
            <Link href="/forgot-password" className="text-starlight transition hover:text-gold">
              Forgot Password?
            </Link>
          </div>
        </div>
    </ScreenLayout>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-3 block text-sm font-semibold text-white">{label}</span>
      {children}
    </label>
  );
}
