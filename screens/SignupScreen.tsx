"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Check, Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

function validatePassword(password: string) {
  return {
    hasLowercase: /[a-z]/.test(password),
    hasMinimumLength: password.length >= 8,
    hasNumber: /\d/.test(password),
    hasSpecialCharacter: /[^A-Za-z0-9]/.test(password),
    hasUppercase: /[A-Z]/.test(password),
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
  const [confirmationSent, setConfirmationSent] = useState(false);
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
      const user = await signup(
        fullName.trim(),
        email.trim(),
        password,
        nextPath,
      );
      if (!user) {
        setConfirmationSent(true);
        return;
      }
      router.push(nextPath as Route);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create account.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenLayout title="Your next story starts here.">
      <p className="public-form-eyebrow">A LITTLE CURIOSITY GOES A LONG WAY</p>
      <h1>
        {confirmationSent ? (
          "One last little step."
        ) : (
          <>
            Your next story
            <br />
            starts here.
          </>
        )}
      </h1>
      <p className="public-form-intro">
        {confirmationSent
          ? "Your studio is almost ready."
          : "Create your space to imagine, explore, and bring a story to life. We’ll figure out the first idea together."}
      </p>
      <StudioEntryNotice nextPath={nextPath} />
      {confirmationSent ? (
        <div className="public-auth-success" role="status">
          <strong>Check your inbox.</strong>We sent a confirmation link to{" "}
          {email}. Open it in this browser to continue to your studio.
          <br />
          <button type="button" onClick={() => setConfirmationSent(false)}>
            Use a different email
          </button>
        </div>
      ) : (
        <form
          noValidate
          onSubmit={handleSubmit}
          className="public-auth-form"
          aria-busy={isSubmitting}
        >
          <Field label="Your name">
            <input
              name="name"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="What should we call you?"
              required
              disabled={isSubmitting}
            />
          </Field>
          <Field label="Email address">
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              disabled={isSubmitting}
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              value={password}
              onChange={setPassword}
              showPassword={showPassword}
              onToggle={() => setShowPassword(!showPassword)}
              disabled={isSubmitting}
              label="password"
            />
          </Field>
          <p className="public-password-help">
            Use 8+ characters, uppercase and lowercase letters, a number, and a
            symbol.
          </p>
          {password && (
            <div
              className="public-password-rules"
              aria-label="Password requirements"
            >
              {[
                ["8+ characters", passwordRules.hasMinimumLength],
                ["Uppercase", passwordRules.hasUppercase],
                ["Lowercase", passwordRules.hasLowercase],
                ["Number", passwordRules.hasNumber],
                ["Symbol", passwordRules.hasSpecialCharacter],
              ].map(([label, passed]) => (
                <span key={String(label)} className={passed ? "passed" : ""}>
                  {passed && <Check size={10} />}
                  {label}
                </span>
              ))}
            </div>
          )}
          <Field label="Confirm password">
            <PasswordInput
              value={confirmPassword}
              onChange={setConfirmPassword}
              showPassword={showConfirmPassword}
              onToggle={() => setShowConfirmPassword(!showConfirmPassword)}
              disabled={isSubmitting}
              label="confirm password"
            />
          </Field>
          {error && (
            <p className="public-auth-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="public-button"
          >
            {isSubmitting ? "Creating your studio…" : "Create my studio"}
            <ArrowUpRight size={17} />
          </button>
        </form>
      )}
      <p className="public-auth-switch">
        Already have a story here?{" "}
        <Link href={`/auth?next=${encodeURIComponent(nextPath)}` as Route}>
          Log in
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
function PasswordInput({
  value,
  onChange,
  showPassword,
  onToggle,
  disabled,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  showPassword: boolean;
  onToggle: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <div className="public-password-input">
      <input
        type={showPassword ? "text" : "password"}
        autoComplete="new-password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        minLength={8}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${showPassword ? "Hide" : "Show"} ${label}`}
        aria-pressed={showPassword}
      >
        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
