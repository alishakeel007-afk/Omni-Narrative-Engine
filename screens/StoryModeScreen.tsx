"use client";

import { useRouter } from "next/navigation";
import ScreenLayout from "@/screens/ScreenLayout";
import { useStory } from "@/context/StoryContext";

export default function StoryModeScreen() {
  const router = useRouter();
  const { updateSetup, saveSetupOnly } = useStory();

  const selectMode = (mode: "guided" | "custom") => {
    updateSetup({ mode });
    saveSetupOnly({ mode });

    router.push(mode === "guided" ? "/video" : "/setup");
  };

  return (
    <ScreenLayout eyebrow="Start a Story" title="Choose Story Mode" description="Guided mode uses Gemini to draft the film. Custom mode is fully manual and only uses Deepgram for voices.">
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
          <p className="mt-3 text-sm text-white/65">Write the story, scenes, and dialogues yourself. AI choices and Gemini drafting stay off.</p>
          <div className="mt-6">
            <button onClick={() => selectMode("custom")} className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:border-gold/25">Use Custom Idea</button>
          </div>
        </div>
      </div>
    </ScreenLayout>
  );
}
