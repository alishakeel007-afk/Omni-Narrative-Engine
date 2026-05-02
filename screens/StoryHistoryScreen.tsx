"use client";

import Link from "next/link";
import ScreenLayout from "@/screens/ScreenLayout";
import { useStory } from "@/context/StoryContext";

export default function StoryHistoryScreen() {
  const { state } = useStory();
  const scenes = [...state.pastScenes, state.currentScene];

  return (
    <ScreenLayout
      eyebrow="Story History"
      title="Scene Timeline"
      description="Browse the generated scene path and the latest playable moment."
      maxWidth="max-w-5xl"
    >
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/story/play" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
          Play
        </Link>
        <Link href="/story/memory" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
          Memory
        </Link>
        <Link href="/story/state" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
          Player State
        </Link>
      </div>

      <div className="space-y-4">
        {scenes.map((scene, index) => {
          const isCurrent = index === scenes.length - 1;

          return (
            <article key={`${scene.sceneNumber}-${scene.title}-${index}`} className="glass-panel rounded-[1.25rem] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-starlight/75">
                    {scene.chapter} - Scene {scene.sceneNumber}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-white">{scene.title}</h2>
                  <p className="mt-1 text-sm text-white/52">{scene.location}</p>
                </div>
                {isCurrent ? (
                  <span className="rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs text-gold">
                    Current
                  </span>
                ) : null}
              </div>
              <p className="mt-4 text-sm leading-7 text-white/70">{scene.text}</p>
            </article>
          );
        })}
      </div>
    </ScreenLayout>
  );
}
