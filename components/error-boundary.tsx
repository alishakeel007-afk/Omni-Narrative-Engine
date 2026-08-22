"use client";

import React, { ReactNode } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import Link from "next/link";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary Component
 * Catches errors in child components and displays error UI
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error Boundary caught:", error, errorInfo);
  }

  retry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      return this.props.fallback ? (
        this.props.fallback(this.state.error, this.retry)
      ) : (
        <DefaultErrorFallback error={this.state.error} onRetry={this.retry} />
      );
    }

    return this.props.children;
  }
}

/**
 * Default error fallback UI
 */
export function DefaultErrorFallback({
  error,
  onRetry
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="max-w-md rounded-lg bg-red-500/10 p-8 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-400 mb-4" />
        <h1 className="text-2xl font-bold text-red-400 mb-2">Something Went Wrong</h1>
        <p className="text-white/70 mb-4">{error.message}</p>
        <div className="space-y-2">
          <button
            onClick={onRetry}
            className="w-full flex items-center justify-center gap-2 rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
          >
            <RotateCcw className="h-4 w-4" />
            Try Again
          </button>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 rounded border border-white/20 bg-white/5 px-4 py-2 font-semibold text-white hover:bg-white/10"
          >
            <Home className="h-4 w-4" />
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook for handling errors in async operations
 */
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const handleError = (err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));
    setError(error);
    console.error("Error caught:", error);
  };

  const clearError = () => setError(null);

  return {
    error,
    handleError,
    clearError,
    hasError: !!error
  };
}
