"use client";

import Link from "next/link";
import type { Route } from "next";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { DEFAULT_AUTH_REDIRECT, getSafeRedirectPath } from "@/lib/auth-redirect";
import ScreenLayout from "@/screens/ScreenLayout";
import { StudioEntryNotice } from "@/components/public/studio-entry-notice";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string) {
  return {
    hasLowercase: /[a-z]/.test(password),
    hasMinimumLength: password.length >= 8,
    hasNumber: /\d/.test(password),
    hasSpecialCharacter: /[^A-Za-z0-9]/.test(password),
    hasUppercase: /[A-Z]/.test(password)
  };
}

export default function SignupScreen() {
  const router = useRouter();
  const { currentUser, loading, signup } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [nextPath, setNextPath] = useState(DEFAULT_AUTH_REDIRECT);
  const passwordRules = useMemo(() => validatePassword(password), [password]);

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

    if (!fullName.trim()) {
      setError("Enter your full name.");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    const allRulesPassed = Object.values(passwordRules).every(Boolean);

    if (!allRulesPassed) {
      setError("Password does not meet the required strength rules.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Password and confirm password must match.");
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await signup(fullName.trim(), email.trim(), password);
      router.push((result.needsVerification ? `/verify-email?next=${encodeURIComponent(nextPath)}` : nextPath) as Route);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenLayout
      eyebrow="Signup"
      title="Create Your Account"
      description="Register with email and password to save your story progress and access the Omni-Narrative experience."
      maxWidth="max-w-lg"
    >
      <div className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.32em] text-[var(--muted)]">Signup</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl text-[var(--ink)]">
            Create Your Account
          </h1>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
            Register with email and password to save your story progress and access the protected Omni-Narrative Engine experience.
          </p>

          <StudioEntryNotice nextPath={nextPath} />
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field label="Full Name">
              <input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className="w-full rounded-[1.2rem] border border-[var(--line)] bg-black/20 px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--line)]"
                placeholder="Your full name"
              />
            </Field>

            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-[1.2rem] border border-[var(--line)] bg-black/20 px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--line)]"
                placeholder="you@example.com"
              />
            </Field>

            <Field label="Password">
              <PasswordInput
                value={password}
                onChange={setPassword}
                showPassword={showPassword}
                onToggle={() => setShowPassword((current) => !current)}
              />
            </Field>

            <Field label="Confirm Password">
              <PasswordInput
                value={confirmPassword}
                onChange={setConfirmPassword}
                showPassword={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((current) => !current)}
              />
            </Field>

            <div className="rounded-[1.2rem] border border-[var(--line)] bg-transparent px-4 py-3 text-sm text-[var(--muted)]">
              <p className="font-semibold text-[var(--ink)]">Password Rules</p>
              <ul className="mt-3 space-y-2">
                {[
                  ["At least 8 characters", passwordRules.hasMinimumLength],
                  ["At least 1 uppercase letter", passwordRules.hasUppercase],
                  ["At least 1 lowercase letter", passwordRules.hasLowercase],
                  ["At least 1 number", passwordRules.hasNumber],
                  ["At least 1 special character", passwordRules.hasSpecialCharacter]
                ].map(([label, passed]) => (
                  <li key={String(label)} className={passed ? "text-[var(--ink)]" : "text-[var(--ink)]/85"}>
                    {passed ? "Passed:" : "Required:"} {label}
                  </li>
                ))}
              </ul>
            </div>

            {error ? (
              <div className="rounded-[1.2rem] border border-[var(--line)] bg-transparent px-4 py-3 text-sm font-medium text-[var(--ink)]">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-full bg-[var(--accent)] px-6 py-4 text-sm font-semibold text-[var(--ink)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
            >
              {isSubmitting ? "Creating account..." : "Sign Up"}
            </button>
          </form>

          <div className="mt-6 text-sm text-[var(--muted)]">
            Already have an account?{' '}
            <Link href={`/auth?next=${encodeURIComponent(nextPath)}` as Route} className="text-[var(--ink)] transition hover:text-[var(--ink)]">
              Login here
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
      <span className="mb-3 block text-sm font-semibold text-[var(--ink)]">{label}</span>
      {children}
    </label>
  );
}

function PasswordInput({
  value,
  onChange,
  showPassword,
  onToggle
}: {
  value: string;
  onChange: (value: string) => void;
  showPassword: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <input
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[1.2rem] border border-[var(--line)] bg-black/20 px-4 py-3 pr-12 text-sm text-[var(--ink)] outline-none focus:border-[var(--line)]"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink)]/85"
        aria-label="Toggle password visibility"
      >
        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
