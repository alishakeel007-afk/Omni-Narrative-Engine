"use client";

import Link from "next/link";
import { DashboardCard } from "@/components/dashboard-card";
import { ProtectedRoute } from "@/components/protected-route";
import ScreenLayout from "@/screens/ScreenLayout";
import { useStory } from "@/context/StoryContext";
import { countCustomChoices } from "@/lib/story-engine";

export default function DashboardScreen() {
  const { setup, state } = useStory();
  const currentScene = state.currentScene.sceneNumber;
  const hasProgress = state.memoryTimeline.length > 0 || state.currentScene.sceneNumber > 1;
  const customChoiceCount = countCustomChoices(state);
  const recentSessionLabel = state.lastSavedAt
    ? new Date(state.lastSavedAt).toLocaleString()
    : "No saved session yet";
  const dynamicStats = [
    { label: "Saved Stories", value: "1 Active Story" },
    { label: "Favorite Genres", value: setup.genre },
    {
      label: "Recent Sessions",
      value: state.lastSavedAt ? new Date(state.lastSavedAt).toLocaleDateString() : "New Run"
    },
    { label: "Total Scenes Generated", value: String(currentScene) },
    { label: "Total Custom Choices Made", value: String(customChoiceCount) }
  ];

  return (
    <ProtectedRoute>
      <ScreenLayout eyebrow="User Dashboard" title="Narrative Command Center" description="Quick access to saved progress, genre preferences, and usage analytics for the AI story experience." maxWidth="max-w-7xl">
          <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Link
              href="/story"
              className="glass-panel gold-ring rounded-[1.75rem] p-6 transition hover:-translate-y-1"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-gold">Continue Last Story</p>
              <h2 className="mt-4 text-2xl font-semibold text-white">{setup.storyTitle}</h2>
              <p className="mt-3 text-sm leading-7 text-white/65">
                {hasProgress
                  ? `Resume Scene ${currentScene} with ${setup.characterName}'s latest decisions still tracked in memory.`
                  : `Open the first scene for ${setup.characterName} and begin the saved ${setup.mode} setup.`}
              </p>
            </Link>

            <Link
              href="/setup"
              className="glass-panel rounded-[1.75rem] p-6 transition hover:-translate-y-1"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-starlight/78">Start New Story</p>
              <h2 className="mt-4 text-2xl font-semibold text-white">Create Fresh Setup</h2>
              <p className="mt-3 text-sm leading-7 text-white/65">
                Pick a genre, define a protagonist, and choose guided or custom story mode.
              </p>
            </Link>

            <Link
              href="/video"
              className="glass-panel rounded-[1.75rem] p-6 transition hover:-translate-y-1"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-gold">Video Studio</p>
              <h2 className="mt-4 text-2xl font-semibold text-white">Build Movie Scenes</h2>
              <p className="mt-3 text-sm leading-7 text-white/65">
                Turn one scenario into scene-by-scene script, dialogue, prompts, and voice audio.
              </p>
            </Link>

            <div className="glass-panel rounded-[1.75rem] p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Saved Stories</p>
              <h2 className="mt-4 text-2xl font-semibold text-white">{setup.storyTitle}</h2>
              <p className="mt-3 text-sm leading-7 text-white/65">
                {setup.genre} story anchored by {setup.characterName} in{' '}
                {setup.mode === "custom" ? "Custom Mode" : "Guided Mode"}.
              </p>
            </div>

            <div className="glass-panel rounded-[1.75rem] p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Recent Sessions</p>
              <h2 className="mt-4 text-2xl font-semibold text-white">
                {hasProgress ? `Scene ${currentScene}` : "Waiting to Begin"}
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/65">{recentSessionLabel}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {dynamicStats.map((item, index) => (
              <DashboardCard key={item.label} title={item.label} value={item.value} accent={index === 0 ? "gold" : "blue"} />
            ))}
          </div>
    </ScreenLayout>
    </ProtectedRoute>
  );
}
