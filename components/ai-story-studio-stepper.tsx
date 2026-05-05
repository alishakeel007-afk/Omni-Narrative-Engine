"use client";

import React from "react";

export type AiStoryStudioStep = 1 | 2 | 3 | 4 | 5;

const STEPS = [
  { id: 1, label: "Setup" },
  { id: 2, label: "Story Builder" },
  { id: 3, label: "Voice Audio" },
  { id: 4, label: "Background Music" },
  { id: 5, label: "Video Preview" }
];

export function AiStoryStudioStepper({ currentStep }: { currentStep: AiStoryStudioStep }) {
  return (
    <div className="mb-8 grid gap-2 md:grid-cols-5">
      {STEPS.map((step) => {
        const isCurrent = step.id === currentStep;
        const isPast = step.id < currentStep;

        return (
          <div
            key={step.id}
            className={`rounded-[1rem] border px-3 py-3 text-sm transition ${
              isCurrent
                ? "border-gold/45 bg-gold/15 text-gold"
                : isPast
                  ? "border-starlight/25 bg-starlight/10 text-starlight"
                  : "border-white/10 bg-white/5 text-white/50"
            }`}
          >
            <p className="text-xs uppercase tracking-[0.18em]">Step {step.id}</p>
            <p className="mt-1 font-semibold">{step.label}</p>
          </div>
        );
      })}
    </div>
  );
}
