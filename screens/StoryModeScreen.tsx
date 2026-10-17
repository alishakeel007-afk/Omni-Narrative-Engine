"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import ScreenLayout from "@/screens/ScreenLayout";
import { useStory } from "@/context/StoryContext";
import { resetCreateStoryDraft } from "@/lib/create-story-storage";
import { resetVideoStudioFlow } from "@/lib/video-storage";

export default function StoryModeScreen() {
  const router = useRouter();
  const { saveSetupOnly, startFreshStorySetup, updateSetup } = useStory();

  const selectMode = (mode: "guided" | "custom") => {
    const isFreshStart =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("fresh") === "1";

    if (isFreshStart) {
      startFreshStorySetup(mode);

      if (mode === "guided") {
        resetVideoStudioFlow();
        router.push("/video");
        return;
      }

      resetCreateStoryDraft();
      router.push("/story-builder");
      return;
    }

    updateSetup({ mode });
    saveSetupOnly({ mode });

    router.push(mode === "guided" ? "/video" : "/story-builder");
  };

  return (
    <ScreenLayout eyebrow="Create Your Story" title="Choose Your Story Mode" description="Choose a guided cinematic path or shape every scene yourself. Both options keep your existing story workflow and saved progress intact.">
      <div className="grid gap-6 md:grid-cols-2">
        <article className="glass-panel flex h-full flex-col overflow-hidden rounded-[1.5rem]">
          <div className="relative aspect-[16/10] overflow-hidden border-b border-starlight/20">
            <Image
              src="/images/guided-mode-fantasy-gateway.png"
              alt="A lantern-bearing adventurer approaching a glowing fantasy gateway"
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-transparent" aria-hidden="true" />
          </div>
          <div className="flex flex-1 flex-col p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-starlight/80">Guided Mode</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">Curated Choices</h2>
            <p className="mt-3 text-sm leading-7 text-white/90">Let the engine offer scenarios, choices, and a structured setup for a smooth cinematic storytelling experience.</p>
            <div className="mt-auto pt-6">
              <button type="button" onClick={() => selectMode("guided")} className="w-full rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-5 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01]">Start Guided</button>
            </div>
          </div>
        </article>

        <article className="glass-panel flex h-full flex-col overflow-hidden rounded-[1.5rem]">
          <div className="relative aspect-[16/10] overflow-hidden border-b border-starlight/20">
            <Image
              src="/images/custom-mode-storyboard-workspace.png"
              alt="A creative writing desk with a storyboard, notebook, and screenplay pages"
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent" aria-hidden="true" />
          </div>
          <div className="flex flex-1 flex-col p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-starlight/80">Custom Mode</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">AI Story Studio</h2>
            <p className="mt-3 text-sm leading-7 text-white/90">Write your story scene by scene, generate AI-assisted dialogue, add voices and music, then preview the result.</p>
            <div className="mt-auto pt-6">
              <button type="button" onClick={() => selectMode("custom")} className="w-full rounded-full border border-starlight/35 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-gold/40 hover:bg-white/10">Start AI Story Studio</button>
            </div>
          </div>
        </article>
      </div>

    </ScreenLayout>
  );
}
