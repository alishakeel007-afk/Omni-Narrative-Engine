"use client";

import { useEffect, useState } from "react";
import { AudioPlayerMock } from "@/components/audio-player-mock";
import BackgroundMusicPlayer from "@/components/background-music-player";

type MediaPanelProps = {
  backgroundMusicMood: string;
  imageLabel: string;
  narrationDuration: string;
  narrationLabel: string;
  sceneMood: string;
  imagePrompt: string;
  audioPrompt: string;
  location?: string;
  sceneId?: string;
  projectId?: string;
  characterNames?: string[];
  characterAppearances?: string[];
};

export function MediaPanel({
  backgroundMusicMood,
  imageLabel,
  narrationDuration,
  narrationLabel,
  sceneMood,
  imagePrompt,
  audioPrompt,
  location,
  sceneId,
  projectId,
  characterNames,
  characterAppearances
}: MediaPanelProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    if (!imagePrompt && !imageLabel) return;
    let mounted = true;

    async function fetchImage() {
      setImageLoading(true);
      setImageError(null);
      try {
        const res = await fetch("/api/video/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sceneId: sceneId || `scene-${Date.now()}`,
            imagePrompt,
            sceneTitle: imageLabel,
            location,
            mood: sceneMood,
            projectId,
            characterNames,
            characterAppearances
          })
        });
        const data = await res.json();
        if (!mounted) return;
        if (!res.ok || !data.imageUrl) {
          throw new Error(data.error ?? "Scene image generation failed.");
        }
        setImageUrl(data.imageUrl);
      } catch (err) {
        if (!mounted) return;
        setImageError(err instanceof Error ? err.message : "Scene image generation failed.");
      } finally {
        if (mounted) setImageLoading(false);
      }
    }

    fetchImage();
    return () => {
      mounted = false;
    };
  }, [imagePrompt, imageLabel, location, sceneMood, sceneId, projectId, characterNames, characterAppearances]);

  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">Generated Media</p>
          <h3 className="mt-2 font-[var(--font-heading)] text-2xl text-white">
            Multi-Modal Output
          </h3>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/90">
          Scene Mood: {sceneMood}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_0.95fr]">
        <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-4">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={imageLabel}
              className="h-72 w-full rounded-[1.25rem] border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-72 items-end rounded-[1.25rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(141,183,255,0.22),transparent_30%),linear-gradient(180deg,#161b39,#0a1022)] p-4">
              <p className="text-sm text-white/85">
                {imageLoading ? "Generating scene visual..." : imageError ?? imageLabel}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.26em] text-white/75">Narration Audio</p>
            <div className="mt-4">
              <AudioPlayerMock />
            </div>
            <p className="mt-3 text-sm text-white/90">
              {narrationLabel} • {narrationDuration}
            </p>
          </div>
          <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.26em] text-white/75">Background Music</p>
            <div className="mt-3">
              <BackgroundMusicPlayer
                sceneMood={backgroundMusicMood}
                sceneTitle={imageLabel}
                audioPrompt={audioPrompt}
                sceneId={sceneId}
                projectId={projectId}
              />
            </div>
          </div>
          <PromptBlock label="Image Prompt Preview" text={imagePrompt} />
          <PromptBlock label="Audio Mood Prompt Preview" text={audioPrompt} />
        </div>
      </div>
    </section>
  );
}

function PromptBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-[1.4rem] border border-starlight/10 bg-starlight/5 p-4">
      <p className="text-xs uppercase tracking-[0.26em] text-starlight/72">{label}</p>
      <p className="mt-3 text-sm leading-7 text-white/72">{text}</p>
    </div>
  );
}
