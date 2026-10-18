"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  DEFAULT_AUTH_REDIRECT,
  getSafeRedirectPath,
} from "@/lib/auth-redirect";
import ScreenLayout from "@/screens/ScreenLayout";
import { StudioEntryNotice } from "@/components/public/studio-entry-notice";

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
    if (params.get("error")) setError(params.get("error")!);
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
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to log in.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenLayout title="Welcome back.">
      <p className="public-form-eyebrow">YOUR NEXT CHAPTER</p>
      <h1>Welcome back.</h1>
      <p className="public-form-intro">
        Your ideas, your characters, your unfinished adventures.
        <br />
        Let’s pick up where you left off.
      </p>
      <StudioEntryNotice nextPath={nextPath} />
      <form
        noValidate
        onSubmit={handleSubmit}
        className="public-auth-form"
        aria-busy={isSubmitting}
      >
        <Field label="Email address">
          <input
            type="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
            disabled={isSubmitting}
          />
        </Field>
        <Field label="Password">
          <div className="public-password-input">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
              required
              disabled={isSubmitting}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </Field>
        <div className="public-form-row">
          <span>A story worth coming back to.</span>
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
        {error && (
          <p className="public-auth-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={isSubmitting} className="public-button">
          {isSubmitting ? "Opening your studio…" : "Return to my story"}
          <ArrowUpRight size={17} />
        </button>
      </form>
      <div className="public-auth-divider">A NEW STORY?</div>
      <p className="public-auth-switch">
        New to OmniNarrative?{" "}
        <Link href={`/signup?next=${encodeURIComponent(nextPath)}` as Route}>
          Start creating
        </Link>
      </p>
    </ScreenLayout>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="public-auth-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
