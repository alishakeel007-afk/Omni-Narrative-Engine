"use client";

import Link from "next/link";
import ScreenLayout from "@/screens/ScreenLayout";
import { useStory } from "@/context/StoryContext";
import type { StorySetupData } from "@/types/story";

const attributeNames: Array<[
  keyof StorySetupData["characterAttributes"],
  string
]> = [
  ["strength", "Strength"],
  ["intelligence", "Intelligence"],
  ["charisma", "Charisma"],
  ["agility", "Agility"],
  ["wisdom", "Wisdom"],
  ["endurance", "Endurance"]
];

export default function StoryStateScreen() {
  const { setup, state } = useStory();
  const scene = state.currentScene;

  return (
    <ScreenLayout
      eyebrow="Player State"
      title={`${setup.characterName} State`}
      description="Current character identity, difficulty, inventory, and run status."
      maxWidth="max-w-5xl"
    >
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="glass-panel rounded-[1.6rem] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-starlight/75">Identity</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">{setup.characterName}</h2>
              <p className="mt-2 text-sm text-white/90">{setup.characterRole}</p>
            </div>
            <span className="rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs text-gold">
              {setup.difficulty}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {setup.characterTraits.map((trait) => (
              <span
                key={trait}
                className="rounded-full border border-starlight/15 bg-starlight/10 px-3 py-1 text-xs text-starlight"
              >
                {trait}
              </span>
            ))}
          </div>

          <div className="mt-6 grid gap-3">
            <StateField label="Story Mode" value={setup.mode} />
            <StateField label="Genre" value={setup.genre} />
            <StateField label="Tone" value={setup.mood} />
            <StateField label="Current Scene" value={`Scene ${scene.sceneNumber} - ${scene.title}`} />
            <StateField label="Location" value={scene.location} />
          </div>
        </section>

        <section className="glass-panel rounded-[1.6rem] p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-starlight/75">Attributes</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {attributeNames.map(([key, label]) => (
              <Meter key={key} label={label} value={setup.characterAttributes[key]} />
            ))}
          </div>

          <div className="mt-7">
            <p className="text-xs uppercase tracking-[0.28em] text-gold">Health / Resolve / Mana</p>
            <div className="mt-5 grid gap-4">
              <Meter label="Health" value={state.healthStatus.health} />
              <Meter label="Resolve" value={state.healthStatus.resolve} />
              <Meter label="Mana" value={state.healthStatus.mana} />
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-[1.6rem] p-6 lg:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-starlight/75">Inventory</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">Tracked Items</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/story/play" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
                Play
              </Link>
              <Link href="/story/memory" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
                Memory
              </Link>
              <Link href="/story/history" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">
                History
              </Link>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {state.inventory.map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/72"
              >
                {item}
              </span>
            ))}
          </div>
        </section>
      </div>
    </ScreenLayout>
  );
}

function StateField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-white/75">{label}</p>
      <p className="mt-2 text-sm font-medium capitalize text-white/82">{value}</p>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-black/20 p-4">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-semibold text-white">{label}</span>
        <span className="text-gold">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-aurora via-starlight to-gold"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
