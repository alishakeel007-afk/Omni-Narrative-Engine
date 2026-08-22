"use client";

import { Loader2 } from "lucide-react";
import React from "react";

type LoadingType = "scene" | "audio" | "image" | "dialogue" | "generic";

interface LoadingStateProps {
  isLoading: boolean;
  type?: LoadingType;
  message?: string;
}

const LOADING_MESSAGES: Record<LoadingType, string> = {
  scene: "Generating the next scene...",
  audio: "Creating audio narration...",
  image: "Rendering scene visuals...",
  dialogue: "Composing dialogue...",
  generic: "Loading..."
};

/**
 * Unified loading indicator component
 */
export function LoadingIndicator({
  isLoading,
  type = "generic",
  message
}: LoadingStateProps) {
  if (!isLoading) return null;

  return (
    <div className="flex items-center justify-center gap-3 rounded-lg bg-white/5 p-4 border border-white/10">
      <Loader2 className="h-5 w-5 animate-spin text-gold" />
      <span className="text-white/80">{message || LOADING_MESSAGES[type]}</span>
    </div>
  );
}

/**
 * Full screen loading overlay
 */
export function LoadingOverlay({
  isLoading,
  type = "generic",
  message
}: LoadingStateProps) {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="rounded-lg bg-slate-900 p-8 text-center">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-gold mb-4" />
        <p className="text-white text-lg font-semibold">
          {message || LOADING_MESSAGES[type]}
        </p>
      </div>
    </div>
  );
}

/**
 * Mini loading indicator for buttons/small areas
 */
export function MiniLoadingIndicator({ isLoading }: { isLoading: boolean }) {
  if (!isLoading) return null;

  return <Loader2 className="inline h-4 w-4 animate-spin" />;
}

/**
 * Hook for loading state management
 */
export function useLoadingState(initialState: boolean = false) {
  const [isLoading, setIsLoading] = React.useState(initialState);

  const withLoading = React.useCallback(
    async <T extends any, U extends any>(
      callback: (...args: U[]) => Promise<T>,
      ...args: U[]
    ): Promise<T | null> => {
      setIsLoading(true);
      try {
        const result = await callback(...args);
        return result;
      } catch (error) {
        console.error("Loading operation failed:", error);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    isLoading,
    setIsLoading,
    withLoading
  };
}

/**
 * Loading skeleton for placeholder content
 */
export function LoadingSkeleton({
  className = "",
  count = 1
}: {
  className?: string;
  count?: number;
}) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse rounded-lg bg-white/10 ${className || "h-12"}`}
        />
      ))}
    </div>
  );
}

/**
 * Skeleton for scene card
 */
export function SceneCardSkeleton() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-6 space-y-4">
      <div className="h-6 w-32 animate-pulse rounded bg-white/10" />
      <div className="h-4 w-full animate-pulse rounded bg-white/10" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-white/10" />
      <div className="grid grid-cols-3 gap-2 pt-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-8 animate-pulse rounded bg-white/10"
          />
        ))}
      </div>
    </div>
  );
}
