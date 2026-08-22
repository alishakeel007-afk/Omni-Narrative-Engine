"use client";

import { useMemo, useState } from "react";
import { CharacterPanel } from "@/components/character-panel";
import { ChoiceCard } from "@/components/choice-card";
import { CustomChoiceInput } from "@/components/custom-choice-input";
import { useStory } from "@/context/StoryContext";
import { DUMMY_SCENE_TEMPLATES } from "@/data/dummyScenes";
import { LoadingSceneGenerator } from "@/components/loading-scene-generator";
import { MediaPanel } from "@/components/media-panel";
import { ProtectedRoute } from "@/components/protected-route";
import ScreenLayout from "@/screens/ScreenLayout";
import { StoryMemoryModal } from "@/components/story-memory-modal";
import { StorySceneCard } from "@/components/story-scene-card";
import { StorySidebar } from "@/components/story-sidebar";

export default function StoryScreen() {
  const { setup, state, continueStory, generateAlternativeOptions, selectSuggestedChoice, selectCustomChoice, setCustomChoiceInput, restartStory } = useStory();
  const [memoryOpen, setMemoryOpen] = useState(false);

  const scene = state.currentScene;
  const activeCharacterProfile = {
    emotionalState: "calm",
    imageLabel: "",
    name: setup.characterName || "Protagonist",
    relationships: [],
    role: setup.characterRole || "Player",
    traits: [],
    visualAppearance: ""
  };
  const activeSceneCharacters = scene?.cast ?? [];

  return (
    <ProtectedRoute>
      <ScreenLayout
        eyebrow="Main Story Experience"
        title={setup.storyTitle}
        description="Guide your protagonist through the next scenes and review memory timeline details."
        maxWidth="max-w-7xl"
      >
        <div className="grid grid-cols-12 gap-6">
          {/* Left Sidebar - 3 cols */}
          <aside className="col-span-12 lg:col-span-3 sticky top-20 space-y-4">
            <div className="rounded-[1.2rem] border border-transparent bg-[#12071a] p-4 text-sm text-white/80">
              <p className="text-xs uppercase tracking-[0.28em] text-starlight/70">Current Run</p>
              <h3 className="mt-2 font-[var(--font-heading)] text-lg text-white">{setup.storyTitle}</h3>
            </div>

            <StorySidebar
              storyTitle={setup.storyTitle}
              currentChapter={scene?.chapter}
              characterName={setup.characterName}
              currentLocation={scene?.location}
              genre={setup.genre}
              healthStatus={state.healthStatus}
              inventory={state.inventory}
              mood={`${setup.mood} / ${scene?.mood ?? "neutral"}`}
              lastSavedAt={state.lastSavedAt ? new Date(state.lastSavedAt).toLocaleString() : null}
              onMemoryOpen={() => setMemoryOpen(true)}
              onRestart={restartStory}
            />
          </aside>

          {/* Main Content - 6 cols */}
          <main className="col-span-12 lg:col-span-6 space-y-6">
            <header className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-starlight/80">Main Story Experience</p>
                <h1 className="mt-2 font-[var(--font-heading)] text-4xl text-white">{scene?.title ?? setup.storyTitle}</h1>
                <p className="mt-2 text-sm text-white/72">{scene?.chapter ?? ""} — {scene?.location ?? ""}</p>
              </div>
              <div className="text-sm text-white/70">Progress: Scene {scene?.sceneNumber ?? 1} of {DUMMY_SCENE_TEMPLATES.length}</div>
            </header>

            <div key={`scene-card-${scene?.sceneNumber ?? 1}`} className="animate-scene-reveal">
              <StorySceneCard
                title={scene?.title ?? "Untitled Scene"}
                text={scene?.text ?? ""}
                mood={scene?.mood ?? ""}
                location={scene?.location ?? ""}
                imageLabel={state.generatedMedia?.imageLabel}
              />
            </div>

            <section className="glass-panel rounded-[1.6rem] p-6">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">Choice Layer</p>
                  <h2 className="mt-2 font-[var(--font-heading)] text-xl text-white">What do you want to do next?</h2>
                </div>
                <button
                  type="button"
                  onClick={generateAlternativeOptions}
                  className="rounded-full border border-white/8 bg-white/3 px-4 py-2 text-sm font-semibold text-white/80 hover:shadow-md transition"
                >
                  Generate More Options
                </button>
              </div>

              <div className="grid gap-3">
                {(scene?.options ?? []).map((option: string) => (
                  <ChoiceCard key={option} text={option} selected={state.selectedChoice === option} onClick={() => selectSuggestedChoice(option)} />
                ))}
              </div>

              <div className="mt-5">
                <CustomChoiceInput value={state.customChoiceInput} onChange={setCustomChoiceInput} onSelect={selectCustomChoice} />
              </div>

              <div className="mt-5 flex items-center justify-between">
                <div className="rounded-[1.6rem] border border-gold/12 bg-gold/5 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-gold">Your Decision</p>
                  <p className="mt-2 text-sm leading-7 text-white/78">{state.selectedChoice || "No choice selected yet."}</p>
                </div>

                <div>
                  {state.isLoading ? (
                    <LoadingSceneGenerator />
                  ) : (
                    <button
                      type="button"
                      onClick={continueStory}
                      disabled={!state.selectedChoice}
                      className="rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-6 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.02] disabled:opacity-50"
                    >
                      Continue to Next Scene
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* Scene Cast preview (moved from CharacterPanel) */}
            <section className="rounded-[1.2rem] border border-white/6 bg-white/3 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.26em] text-starlight/75">Scene Cast</p>
                  <h3 className="mt-1 font-[var(--font-heading)] text-lg text-white">Other Characters In This Scene</h3>
                </div>
                <span className="text-sm text-white/90">{(activeSceneCharacters ?? []).length} tracked</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {(activeSceneCharacters ?? []).map((c) => (
                  <article key={`${c.name}-${c.role}`} className="rounded-lg border border-white/6 bg-black/20 p-4 hover:shadow-[0_8px_30px_rgba(124,58,237,0.08)] transition">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-lg font-semibold text-white">{c.name}</p>
                        <p className="mt-1 text-sm text-starlight">{c.role}</p>
                      </div>
                      <span className="rounded-full border border-gold/12 bg-gold/10 px-3 py-1 text-[11px] text-gold">{c.emotionalState}</span>
                    </div>
                    <p className="mt-3 text-sm text-white/70">{c.visualAppearance}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(c.traits ?? []).map((t) => (
                        <span key={`${c.name}-${t}`} className="rounded-full border border-white/8 bg-white/6 px-2 py-1 text-xs text-white/80">{t}</span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </main>

          {/* Right Panel - 3 cols */}
          <aside className="col-span-12 lg:col-span-3 space-y-6 sticky top-20">
            <CharacterPanel primaryCharacter={activeCharacterProfile} sceneCharacters={activeSceneCharacters} />
            <div key={`scene-media-${scene?.sceneNumber ?? 1}`} className="animate-scene-reveal">
              <MediaPanel
                backgroundMusicMood={state.generatedMedia?.backgroundMusicMood}
                imageLabel={state.generatedMedia?.imageLabel}
                narrationDuration={state.generatedMedia?.narrationDuration}
                narrationLabel={state.generatedMedia?.narrationLabel}
                sceneMood={`${setup.mood} + ${scene?.mood ?? ""}`}
                imagePrompt={state.generatedMedia?.imagePrompt}
                audioPrompt={state.generatedMedia?.audioMoodPrompt}
              />
            </div>
          </aside>
        </div>
      </ScreenLayout>

      <StoryMemoryModal open={memoryOpen} onClose={() => setMemoryOpen(false)} items={state.memoryTimeline} />
    </ProtectedRoute>
  );
}
