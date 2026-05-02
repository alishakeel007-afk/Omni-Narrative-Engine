"use client";

import { useState } from "react";
import Link from "next/link";
import ExportModal from "@/components/ExportModal";
import { ChoiceCard } from "@/components/choice-card";
import { CustomChoiceInput } from "@/components/custom-choice-input";
import { LoadingSceneGenerator } from "@/components/loading-scene-generator";
import { StorySceneCard } from "@/components/story-scene-card";
import ScreenLayout from "@/screens/ScreenLayout";
import { useStory } from "@/context/StoryContext";

export default function StoryPlay() {
  const {
    setup,
    state,
    continueStory,
    generateAlternativeOptions,
    selectSuggestedChoice,
    selectCustomChoice,
    setCustomChoiceInput
  } = useStory();

  const scene = state.currentScene;
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <ScreenLayout
      eyebrow="Play"
      title={setup.storyTitle}
      description="Play through your scenes and make choices."
      maxWidth="max-w-4xl"
    >
      <div className="space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-starlight/80">Scene</p>
            <h1 className="mt-2 font-[var(--font-heading)] text-3xl text-white">{scene?.title ?? "Untitled Scene"}</h1>
            <p className="mt-1 text-sm text-white/72">{scene?.chapter ?? ""} — {scene?.location ?? ""}</p>
          </div>
          <div className="flex gap-3 items-center">
            <Link href="/story/overview" className="text-sm text-white/70 hover:underline">Overview</Link>
            <button onClick={() => setExportOpen(true)} className="rounded-full border border-white/8 bg-white/3 px-3 py-2 text-sm text-white/80 hover:shadow-md transition">End Story / Export</button>
          </div>
        </header>

        <article className="glass-panel rounded-[1.2rem] p-6">
          <StorySceneCard
            title={scene?.title ?? "Untitled Scene"}
            text={scene?.text ?? ""}
            mood={scene?.mood ?? ""}
            location={scene?.location ?? ""}
            imageLabel={state.generatedMedia?.imageLabel}
          />
        </article>

        <section className="glass-panel rounded-[1.2rem] p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">Choice Layer</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-lg text-white">What do you want to do next?</h2>
            </div>
            <button
              type="button"
              onClick={generateAlternativeOptions}
              className="rounded-full border border-white/8 bg-white/3 px-3 py-2 text-sm font-semibold text-white/80 hover:shadow-md transition"
            >
              More Options
            </button>
          </div>

          <div className="grid gap-3">
            {(scene?.options ?? []).map((option: string) => (
              <ChoiceCard key={option} text={option} selected={state.selectedChoice === option} onClick={() => selectSuggestedChoice(option)} />
            ))}
          </div>

          <div className="mt-4">
            <CustomChoiceInput value={state.customChoiceInput} onChange={setCustomChoiceInput} onSelect={selectCustomChoice} />
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="rounded-[1rem] border border-gold/12 bg-gold/5 p-3">
              <p className="text-xs uppercase tracking-[0.26em] text-gold">Your Decision</p>
              <p className="mt-2 text-sm text-white/78">{state.selectedChoice || "No choice selected yet."}</p>
            </div>

            <div>
              {state.isLoading ? (
                <LoadingSceneGenerator />
              ) : (
                <button
                  type="button"
                  onClick={continueStory}
                  disabled={!state.selectedChoice}
                  className="rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-5 py-2 text-sm font-semibold text-slate-950 transition disabled:opacity-50"
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </ScreenLayout>
  );
}
