"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import ScreenLayout from "@/screens/ScreenLayout";

function validatePassword(password: string) {
  return {
    hasLowercase: /[a-z]/.test(password),
    hasMinimumLength: password.length >= 8,
    hasNumber: /\d/.test(password),
    hasSpecialCharacter: /[^A-Za-z0-9]/.test(password),
    hasUppercase: /[A-Z]/.test(password)
  };
}

export default function ResetPasswordScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resetPassword } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordRules = useMemo(() => validatePassword(password), [password]);


  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");



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
      await resetPassword(password);
      setSuccess(true);
      setTimeout(() => {
        router.push("/auth");
      }, 3000);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenLayout
      eyebrow="Security"
      title="Reset Password"
      description="Enter your new password to secure your account."
      maxWidth="max-w-lg"
    >
      <div className="glass-panel rounded-[2rem] p-8">
          <p className="text-xs uppercase tracking-[0.32em] text-slate-500">Security</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl text-slate-900">
            Reset Password
          </h1>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            Please enter your new password below.
          </p>

          {success ? (
            <div className="mt-8 rounded-[1.2rem] border border-green-200 bg-green-50 px-4 py-6 text-center text-sm text-green-700">
              <p className="font-semibold text-green-800 mb-2">Password Reset Successfully</p>
              <p>You can now log in with your new password. Redirecting to login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <Field label="New Password">
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  showPassword={showPassword}
                  onToggle={() => setShowPassword((current) => !current)}
                />
              </Field>

              <Field label="Confirm New Password">
                <PasswordInput
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  showPassword={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((current) => !current)}
                />
              </Field>

              <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">Password Rules</p>
                <ul className="mt-3 space-y-2">
                  {[
                    ["At least 8 characters", passwordRules.hasMinimumLength],
                    ["At least 1 uppercase letter", passwordRules.hasUppercase],
                    ["At least 1 lowercase letter", passwordRules.hasLowercase],
                    ["At least 1 number", passwordRules.hasNumber],
                    ["At least 1 special character", passwordRules.hasSpecialCharacter]
                  ].map(([label, passed]) => (
                    <li key={String(label)} className={passed ? "text-green-600" : "text-slate-500"}>
                      {passed ? "Passed:" : "Required:"} {label}
                    </li>
                  ))}
                </ul>
              </div>

              {error ? (
                <div className="rounded-[1.2rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-6 py-4 text-sm font-semibold text-white transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isSubmitting ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-sm text-slate-600">
            <Link href="/auth" className="text-slate-600 transition hover:text-gold">
              Back to Login
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
      <span className="mb-3 block text-sm font-semibold text-slate-900">{label}</span>
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
        className="w-full rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 pr-12 text-sm text-slate-900 outline-none focus:border-gold/30"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
        aria-label="Toggle password visibility"
      >
        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
