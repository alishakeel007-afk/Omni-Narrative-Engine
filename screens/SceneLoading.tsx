"use client";

import React from "react";
import { useStory } from "@/context/StoryContext";

export default function SceneLoading() {
  const { state } = useStory();

  if (!state.isLoading) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="glass-panel rounded-2xl p-6 text-center">
        <div className="animate-pulseSlow text-white">Generating next scene...</div>
        <div className="mt-4 h-2 w-48 overflow-hidden rounded-full bg-white/6">
          <div className="h-2 w-24 bg-gradient-to-r from-aurora to-gold animate-shimmer" />
        </div>
      </div>
    </div>
  );
}
