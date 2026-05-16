"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BrainCircuit,
  Clapperboard,
  Gauge,
  History,
  ScrollText,
  Sparkles,
  UserRound
} from "lucide-react";
import ExportModal from "@/components/ExportModal";
import { ChoiceCard } from "@/components/choice-card";
import { CustomChoiceInput } from "@/components/custom-choice-input";
import { LoadingSceneGenerator } from "@/components/loading-scene-generator";
import { StorySceneCard } from "@/components/story-scene-card";
import ScreenLayout from "@/screens/ScreenLayout";
import { useStory } from "@/context/StoryContext";
import { buildPrimaryCharacterProfile } from "@/lib/story-engine";
import type { StorySetupData } from "@/types/story";

const attributeLabels: Array<[
  keyof StorySetupData["characterAttributes"],
  string
]> = [
  ["strength", "STR"],
  ["intelligence", "INT"],
  ["charisma", "CHA"],
  ["agility", "AGL"],
  ["wisdom", "WIS"],
  ["endurance", "END"]
];

const workflowLinks = [
  { href: "/story/overview", icon: Clapperboard, label: "Overview" },
  { href: "/story/memory", icon: BrainCircuit, label: "Memory" },
  { href: "/story/history", icon: History, label: "History" },
  { href: "/story/state", icon: Gauge, label: "State" }
] as const;

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
  const primaryCharacter = {
    ...buildPrimaryCharacterProfile(setup),
    emotionalState: scene?.mood ?? setup.mood,
    traits: setup.characterTraits
  };
  const recentMemory = state.memoryTimeline.slice(-3).reverse();
  const isCustomMode = setup.mode === "custom";

  return (
    <ScreenLayout
      eyebrow="Active Story Loop"
      title={setup.storyTitle}
      description={
        isCustomMode
          ? "Custom Mode removes AI choices and keeps the scene controlled by your own writing."
          : "Scene text, guided choices, custom input, player state, memory, and media context in one workspace."
      }
      maxWidth="max-w-7xl"
    >
      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section className="glass-panel rounded-[1.5rem] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-starlight/75">Run</p>
                <h2 className="mt-2 text-xl font-semibold text-white">{setup.scenarioTitle}</h2>
              </div>
              <span className="rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs capitalize text-gold">
                {setup.mode}
              </span>
            </div>

            <div className="mt-5 grid gap-3">
              <MiniField label="Genres" value={setup.genres.join(", ")} />
              <MiniField label="Tones" value={`${setup.moods.join(", ")} / ${scene.mood}`} />
              <MiniField label="Difficulty" value={setup.difficulty} />
              <MiniField label="Scene" value={`${scene.sceneNumber}`} />
            </div>
          </section>

          <section className="glass-panel rounded-[1.5rem] p-5">
            <div className="flex items-center gap-3">
              <UserRound className="h-5 w-5 text-gold" />
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-starlight/75">Character</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{setup.characterName}</h2>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {setup.characters.map((character, index) => (
                <div key={`${character.name}-${index}`} className="rounded-[1rem] border border-white/10 bg-black/20 p-3">
                  <p className="text-sm font-semibold text-white">{character.name || "Unnamed"}</p>
                  <p className="mt-1 text-xs text-starlight">{character.role || "No role"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {character.traits.map((trait) => (
                      <span key={`${character.name}-${trait}`} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                        {trait}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-[1.5rem] p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-starlight/75">Attributes</p>
            <div className="mt-4 grid gap-3">
              {attributeLabels.map(([key, label]) => (
                <AttributeMeter key={key} label={label} value={setup.characterAttributes[key]} />
              ))}
            </div>
          </section>
        </aside>

        <main className="space-y-6">
          <div className="flex flex-col gap-4 rounded-[1.4rem] border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">
                {scene.chapter} - Scene {scene.sceneNumber}
              </p>
              <h1 className="mt-2 font-[var(--font-heading)] text-3xl text-white">
                {scene.title}
              </h1>
              <p className="mt-2 text-sm text-white/66">{scene.location}</p>
            </div>
            <button
              type="button"
              onClick={() => setExportOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-4 py-3 text-sm font-semibold text-gold transition hover:bg-gold/15"
            >
              <ScrollText className="h-4 w-4" />
              End / Export
            </button>
          </div>

          <StorySceneCard
            title={scene.title}
            text={scene.text}
            mood={scene.mood}
            location={scene.location}
            imageLabel={state.generatedMedia?.imageLabel}
          />

          {isCustomMode ? (
            <section className="glass-panel rounded-[1.5rem] p-5 sm:p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-starlight/80">Custom Mode</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Write the next scene yourself</h2>
              <p className="mt-3 text-sm leading-7 text-white/66">
                AI suggested choices are disabled here. Use this box to write the next action, scene beat, or dialogue direction in your own words.
              </p>

              <div className="mt-5">
                <CustomChoiceInput
                  value={state.customChoiceInput}
                  onChange={setCustomChoiceInput}
                  onSelect={selectCustomChoice}
                />
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="rounded-[1rem] border border-gold/15 bg-gold/5 p-4">
                  <p className="text-xs uppercase tracking-[0.26em] text-gold">Your Writing</p>
                  <p className="mt-2 text-sm leading-7 text-white/78">
                    {state.selectedChoice || "Write your custom story direction above."}
                  </p>
                </div>

                {state.isLoading ? (
                  <LoadingSceneGenerator />
                ) : (
                  <button
                    type="button"
                    onClick={continueStory}
                    disabled={!state.selectedChoice}
                    className="rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-6 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Continue With My Writing
                  </button>
                )}
              </div>
            </section>
          ) : (
          <section className="glass-panel rounded-[1.5rem] p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Interactive Story</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Choose the next action</h2>
              </div>
              <button
                type="button"
                onClick={generateAlternativeOptions}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:border-starlight/30 hover:bg-white/10"
              >
                <Sparkles className="h-4 w-4" />
                More Options
              </button>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-white">Guided choices</p>
                {(scene.options ?? []).map((option: string) => (
                  <ChoiceCard
                    key={option}
                    text={option}
                    selected={state.selectedChoice === option}
                    onClick={() => selectSuggestedChoice(option)}
                  />
                ))}
              </div>

              <div>
                <CustomChoiceInput
                  value={state.customChoiceInput}
                  onChange={setCustomChoiceInput}
                  onSelect={selectCustomChoice}
                />
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="rounded-[1rem] border border-gold/15 bg-gold/5 p-4">
                <p className="text-xs uppercase tracking-[0.26em] text-gold">Selected Decision</p>
                <p className="mt-2 text-sm leading-7 text-white/78">
                  {state.selectedChoice || "Pick a guided choice or write your own action."}
                </p>
              </div>

              {state.isLoading ? (
                <LoadingSceneGenerator />
              ) : (
                <button
                  type="button"
                  onClick={continueStory}
                  disabled={!state.selectedChoice}
                  className="rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-6 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Generate Next Scene
                </button>
              )}
            </div>
          </section>
          )}
        </main>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section className="glass-panel rounded-[1.5rem] p-5">
            <p className="text-xs uppercase tracking-[0.26em] text-starlight/75">Workflow</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {workflowLinks.map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center justify-center gap-2 rounded-[1rem] border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/78 transition hover:border-gold/25 hover:text-white"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-[1.5rem] p-5">
            <p className="text-xs uppercase tracking-[0.26em] text-starlight/75">Scene Cast</p>
            <div className="mt-4 space-y-3">
              {[primaryCharacter, ...(scene.cast ?? []).filter((character) => character.name !== primaryCharacter.name)].map((character) => (
                <article key={`${character.name}-${character.role}`} className="rounded-[1rem] border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{character.name}</p>
                      <p className="mt-1 text-xs text-starlight">{character.role}</p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60">
                      {character.emotionalState}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-[1.5rem] p-5">
            <p className="text-xs uppercase tracking-[0.26em] text-starlight/75">Continuity</p>
            <div className="mt-4 space-y-3">
              {recentMemory.length === 0 ? (
                <p className="rounded-[1rem] border border-white/10 bg-black/20 p-4 text-sm leading-7 text-white/62">
                  The first decision will create the opening memory record.
                </p>
              ) : (
                recentMemory.map((item) => (
                  <article key={`${item.timestamp}-${item.sceneNumber}`} className="rounded-[1rem] border border-white/10 bg-black/20 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-gold">Scene {item.sceneNumber}</p>
                    <p className="mt-2 text-sm leading-7 text-white/70">{item.result}</p>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="glass-panel rounded-[1.5rem] p-5">
            <p className="text-xs uppercase tracking-[0.26em] text-starlight/75">Media Context</p>
            <div className="mt-4 space-y-3">
              <PromptPreview label="Image" value={state.generatedMedia?.imagePrompt} />
              <PromptPreview label="Voice" value={state.generatedMedia?.narrationLabel} />
              <PromptPreview label="Music" value={state.generatedMedia?.audioMoodPrompt} />
            </div>
          </section>
        </aside>
      </div>

      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
    </ScreenLayout>
  );
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-white/42">{label}</p>
      <p className="mt-1 text-sm font-medium text-white/80">{value}</p>
    </div>
  );
}

function AttributeMeter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-white/55">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-aurora to-gold"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function PromptPreview({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-white/42">{label}</p>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-white/68">{value}</p>
    </div>
  );
}
