"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ScreenLayout from "@/screens/ScreenLayout";
import { StorySidebar } from "@/components/story-sidebar";
import { CharacterPanel } from "@/components/character-panel";
import { MediaPanel } from "@/components/media-panel";
import { useStory } from "@/context/StoryContext";

export default function StoryOverview() {
  const { setup, state, restartStory, updateCurrentSceneMedia } = useStory();
  const router = useRouter();
  const scene = state.currentScene;

  const activeCharacterProfile = {
    emotionalState: "calm",
    imageLabel: state.generatedMedia?.imageLabel ?? "",
    name: setup.characterName || "Protagonist",
    relationships: [],
    role: setup.characterRole || "Player",
    traits: [],
    visualAppearance: ""
  };

  return (
    <ScreenLayout
      eyebrow="Overview"
      title={`${setup.storyTitle} — Overview`}
      description="Story metadata, character profiles and media assets."
      maxWidth="max-w-5xl"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-4">
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
            onMemoryOpen={() => router.push("/story/memory")}
            onRestart={restartStory}
          />
        </div>

        <div className="col-span-12 lg:col-span-5 space-y-6">
          <div className="rounded-[1.2rem] border border-white/6 bg-black/10 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-[var(--font-heading)] text-xl text-white">Character Portrait</h2>
              <Link href="/story/play" className="text-sm text-white/70 hover:underline">Play</Link>
            </div>
            <p className="mt-3 text-sm text-white/70">Visual assets and scene media for the current run.</p>
          </div>

          <CharacterPanel primaryCharacter={activeCharacterProfile as any} sceneCharacters={scene?.cast ?? []} />
        </div>

        <div className="col-span-12 lg:col-span-3 space-y-6">
          <MediaPanel
            backgroundMusicMood={state.generatedMedia?.backgroundMusicMood}
            imageLabel={state.generatedMedia?.imageLabel}
            narrationDuration={state.generatedMedia?.narrationDuration}
            narrationLabel={state.generatedMedia?.narrationLabel}
            sceneMood={`${setup.mood} + ${scene?.mood ?? ""}`}
            imagePrompt={state.generatedMedia?.imagePrompt}
            audioPrompt={state.generatedMedia?.audioMoodPrompt}
            narrationText={scene?.text ?? ""}
            location={scene?.location}
            sceneNumber={scene?.sceneNumber ?? state.currentSceneIndex}
            draftId={setup.draftId}
            projectId={setup.projectId}
            characterNames={(scene?.cast ?? []).map((c) => c.name).filter(Boolean)}
            characterAppearances={(scene?.cast ?? []).map((c) => c.visualAppearance).filter(Boolean)}
            existingImageUrl={state.generatedMedia?.imageUrl}
            existingNarrationUrl={state.generatedMedia?.narrationAudioUrl}
            existingMusicUrl={state.generatedMedia?.musicUrl}
            onMediaUpdate={updateCurrentSceneMedia}
          />
        </div>
      </div>
    </ScreenLayout>
  );
}
