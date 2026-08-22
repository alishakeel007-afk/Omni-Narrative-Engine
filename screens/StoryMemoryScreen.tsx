"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import ScreenLayout from "@/screens/ScreenLayout";
import { useStory } from "@/context/StoryContext";

export default function StoryMemoryScreen() {
  const { setup, state } = useStory();
  const scenes = [...state.pastScenes, state.currentScene];
  const locations = Array.from(new Set(scenes.map((scene) => scene.location)));
  const characters = Array.from(
    new Map(
      [
        {
          name: setup.characterName,
          role: setup.characterRole,
          emotionalState: state.currentScene.mood
        },
        ...state.currentScene.cast
      ].map((character) => [character.name, character])
    ).values()
  );
  const activeThreads = [
    setup.scenarioTitle,
    state.selectedChoice || "Next decision pending",
    `${setup.difficulty} difficulty path`,
    `${setup.mood} tone baseline`
  ];

  return (
    <ScreenLayout
      eyebrow="Story Memory"
      title="Continuity Board"
      description="Key events, characters, locations, and active threads for the current run."
      maxWidth="max-w-6xl"
    >
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/story/play" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
          Play
        </Link>
        <Link href="/story/history" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
          History
        </Link>
        <Link href="/story/state" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
          Player State
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <MemoryPanel title="Key Events">
          {state.memoryTimeline.length === 0 ? (
            <Empty text="No saved decisions yet." />
          ) : (
            state.memoryTimeline.map((item) => (
              <article key={`${item.timestamp}-${item.sceneNumber}`} className="rounded-[1rem] border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-gold">Scene {item.sceneNumber}</p>
                <p className="mt-2 text-sm leading-7 text-white/72">{item.result}</p>
                <p className="mt-2 text-xs text-white/75">Choice: {item.choiceType} - {item.userChoice}</p>
              </article>
            ))
          )}
        </MemoryPanel>

        <MemoryPanel title="Characters Met">
          {characters.map((character) => (
            <article key={character.name} className="rounded-[1rem] border border-white/10 bg-black/20 p-4">
              <p className="font-semibold text-white">{character.name}</p>
              <p className="mt-1 text-sm text-starlight">{character.role}</p>
              <p className="mt-2 text-xs text-white/85">{character.emotionalState}</p>
            </article>
          ))}
        </MemoryPanel>

        <MemoryPanel title="Locations">
          {locations.map((location) => (
            <article key={location} className="rounded-[1rem] border border-white/10 bg-black/20 p-4">
              <p className="text-sm font-semibold text-white">{location}</p>
              <p className="mt-2 text-xs text-white/85">Visited</p>
            </article>
          ))}
        </MemoryPanel>

        <MemoryPanel title="Active Threads">
          {activeThreads.map((thread) => (
            <article key={thread} className="rounded-[1rem] border border-white/10 bg-black/20 p-4">
              <p className="text-sm leading-7 text-white/72">{thread}</p>
            </article>
          ))}
        </MemoryPanel>
      </div>
    </ScreenLayout>
  );
}

function MemoryPanel({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="glass-panel rounded-[1.5rem] p-5">
      <p className="text-xs uppercase tracking-[0.28em] text-starlight/75">{title}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-black/20 p-4 text-sm text-white/90">
      {text}
    </div>
  );
}
