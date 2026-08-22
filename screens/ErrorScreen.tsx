"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Wifi, Clock, Lock, Zap, Home } from "lucide-react";
import ScreenLayout from "@/screens/ScreenLayout";

type ErrorType = "network" | "rate-limit" | "session" | "server" | "unknown";

interface ErrorScreenProps {
  errorType: ErrorType;
  message?: string;
  onRetry?: () => void;
}

const ERROR_CONFIG: Record<ErrorType, { title: string; icon: React.ReactNode; color: string }> = {
  network: {
    title: "Connection Lost",
    icon: <Wifi className="h-16 w-16" />,
    color: "from-blue-500 to-blue-600"
  },
  "rate-limit": {
    title: "Service Busy",
    icon: <Clock className="h-16 w-16" />,
    color: "from-yellow-500 to-yellow-600"
  },
  session: {
    title: "Session Expired",
    icon: <Lock className="h-16 w-16" />,
    color: "from-red-500 to-red-600"
  },
  server: {
    title: "Server Error",
    icon: <Zap className="h-16 w-16" />,
    color: "from-red-500 to-orange-600"
  },
  unknown: {
    title: "Something Went Wrong",
    icon: <AlertTriangle className="h-16 w-16" />,
    color: "from-gray-500 to-gray-600"
  }
};

export default function ErrorScreen({ errorType, message, onRetry }: ErrorScreenProps) {
  const router = useRouter();
  const config = ERROR_CONFIG[errorType];

  const descriptions: Record<ErrorType, string> = {
    network:
      "We lost your connection to the server. Please check your internet and try again.",
    "rate-limit":
      "Our AI services are currently busy. Please wait a moment and try again.",
    session: "Your session has expired. Please log in again to continue your story.",
    server:
      "Our servers are experiencing issues. Our team has been notified. Please try again later.",
    unknown: "An unexpected error occurred. Please try again or contact support."
  };

  const description = message || descriptions[errorType];

  return (
    <ScreenLayout
      eyebrow="Error"
      title={config.title}
      description={description}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-8">
        {/* Error Icon and Message */}
        <div className={`glass-panel rounded-[2rem] p-8 text-center bg-gradient-to-br ${config.color} bg-opacity-10`}>
          <div className="mb-4 flex justify-center text-red-400">
            {config.icon}
          </div>
          <h1 className="text-3xl font-[var(--font-heading)] text-white">
            {config.title}
          </h1>
          <p className="mt-4 text-lg text-white/80">
            {description}
          </p>
        </div>

        {/* Detailed Information */}
        <div className="glass-panel rounded-[1.5rem] p-6">
          <h2 className="mb-4 text-sm uppercase tracking-wider text-gold">What You Can Do</h2>
          <ul className="space-y-3 text-white/80">
            {errorType === "network" && (
              <>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Check your internet connection</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Try disabling any VPN or proxy</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Refresh the page and try again</span>
                </li>
              </>
            )}

            {errorType === "rate-limit" && (
              <>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Wait 1-2 minutes and try again</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Reduce the frequency of requests</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Try a shorter scene if possible</span>
                </li>
              </>
            )}

            {errorType === "session" && (
              <>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Log in with your credentials</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Check if your session has expired</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Clear browser cookies if persisting</span>
                </li>
              </>
            )}

            {errorType === "server" && (
              <>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Try again in a few moments</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Check our status page for updates</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Your progress has been auto-saved</span>
                </li>
              </>
            )}

            {errorType === "unknown" && (
              <>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Try refreshing the page</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Check the browser console for details</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-gold">•</span>
                  <span>Contact support if the issue persists</span>
                </li>
              </>
            )}
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className="w-full rounded-lg bg-gradient-to-r from-aurora via-starlight to-gold px-6 py-3 font-semibold text-slate-950 transition hover:shadow-lg hover:shadow-gold/20"
            >
              Try Again
            </button>
          )}

          {errorType === "session" && (
            <Link
              href="/auth"
              className="flex justify-center rounded-lg bg-gradient-to-r from-aurora via-starlight to-gold px-6 py-3 font-semibold text-slate-950 transition hover:shadow-lg hover:shadow-gold/20"
            >
              Go to Login
            </Link>
          )}

          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
          >
            <Home className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>

        {/* Support Info */}
        <div className="rounded-lg bg-white/5 p-4 text-center text-sm text-white/60">
          <p>
            If this problem persists, please contact us at{" "}
            <a href="mailto:support@omninarrative.dev" className="text-gold hover:underline">
              support@omninarrative.dev
            </a>
          </p>
        </div>
      </div>
    </ScreenLayout>
  );
}
