"use client";

import React from "react";
import { Check, Lock } from "lucide-react";

export type AiStoryStudioStep = 1 | 2 | 3 | 4 | 5 | 6;

const STEPS = [
  { id: 1, label: "Setup" },
  { id: 2, label: "Story Builder" },
  { id: 3, label: "Voice Audio" },
  { id: 4, label: "Preview Visuals" },
  { id: 5, label: "Background Music" },
  { id: 6, label: "Video Preview" }
];

export function AiStoryStudioStepper({ currentStep }: { currentStep: AiStoryStudioStep }) {
  return (
    <div className="mb-8 grid gap-2 md:grid-cols-6">
      {STEPS.map((step) => {
        const isCurrent = step.id === currentStep;
        const isPast = step.id < currentStep;
        const isFuture = step.id > currentStep;

        return (
          <div
            key={step.id}
            className={`rounded-[1rem] border px-4 py-3 text-sm transition relative overflow-hidden ${
              isCurrent
                ? "border-gold/45 bg-gold/15 text-gold shadow-[0_0_15px_rgba(255,215,0,0.15)]"
                : isPast
                  ? "border-starlight/25 bg-starlight/10 text-starlight"
                  : "border-white/5 bg-black/20 text-white/30 grayscale"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.18em]">Step {step.id}</p>
              {isPast && <Check className="h-3.5 w-3.5" />}
              {isFuture && <Lock className="h-3.5 w-3.5 opacity-40" />}
            </div>
            <p className="mt-1 font-semibold">{step.label}</p>
          </div>
        );
      })}
    </div>
  );
}
