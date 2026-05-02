"use client";

import { useRouter } from "next/navigation";
import ScreenLayout from "@/screens/ScreenLayout";
import { useStory } from "@/context/StoryContext";

export default function StoryModeScreen() {
  const router = useRouter();
  const { setup, updateSetup, saveSetupOnly, beginStoryFromSetup } = useStory();

  const selectMode = (mode: "guided" | "custom") => {
    updateSetup({ mode });
    saveSetupOnly();

    if (mode === "guided") {
      router.push("/setup");
      return;
    }

    // For custom mode, keep the starter idea and start the story immediately
    beginStoryFromSetup();
    router.push("/story");
  };

  return (
    <ScreenLayout eyebrow="Start a Story" title="Choose Story Mode" description="Guided mode provides curated options. Custom mode lets you type your own idea.">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="glass-panel rounded-[1.5rem] p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-starlight/80">Guided Mode</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Curated Choices</h2>
          <p className="mt-3 text-sm text-white/65">Let the engine offer scenarios, choices and a structured setup for a smoother experience.</p>
          <div className="mt-6">
            <button onClick={() => selectMode("guided")} className="rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-5 py-3 text-sm font-semibold text-slate-950">Start Guided</button>
          </div>
        </div>

        <div className="glass-panel rounded-[1.5rem] p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-starlight/80">Custom Mode</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">Your Own Idea</h2>
          <p className="mt-3 text-sm text-white/65">Type a story idea and jump straight into creating scenes driven by your input.</p>
          <div className="mt-6">
            <button onClick={() => selectMode("custom")} className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:border-gold/25">Use Custom Idea</button>
          </div>
        </div>
      </div>
    </ScreenLayout>
  );
}
