"use client";

import { useEffect, useRef, useState } from "react";

type SceneMediaProps = {
  imagePrompt: string;
  imageLabel: string;
  location?: string;
  sceneMood: string;
  narrationText: string;
  narrationLabel: string;
  narrationDuration: string;
  audioMoodPrompt: string;
  backgroundMusicMood: string;
  sceneNumber: number;
  draftId?: string;
  projectId?: string;
  characterNames?: string[];
  characterAppearances?: string[];
  existingImageUrl?: string;
  existingNarrationUrl?: string;
  existingMusicUrl?: string;
  onUpdate?: (patch: { imageUrl?: string; narrationAudioUrl?: string; musicUrl?: string }) => void;
};

export function SceneMedia({
  imagePrompt,
  imageLabel,
  location,
  sceneMood,
  narrationText,
  narrationLabel,
  narrationDuration,
  audioMoodPrompt,
  backgroundMusicMood,
  sceneNumber,
  draftId,
  projectId,
  characterNames,
  characterAppearances,
  existingImageUrl,
  existingNarrationUrl,
  existingMusicUrl,
  onUpdate
}: SceneMediaProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(existingImageUrl ?? null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const [narrationUrl, setNarrationUrl] = useState<string | null>(existingNarrationUrl ?? null);
  const [narrationLoading, setNarrationLoading] = useState(false);
  const [narrationError, setNarrationError] = useState<string | null>(null);

  const [musicUrl, setMusicUrl] = useState<string | null>(existingMusicUrl ?? null);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);

  const generatedForScene = useRef<number | null>(null);

  useEffect(() => {
    if (generatedForScene.current === sceneNumber) return;
    generatedForScene.current = sceneNumber;

    setImageUrl(existingImageUrl ?? null);
    setNarrationUrl(existingNarrationUrl ?? null);
    setMusicUrl(existingMusicUrl ?? null);

    let mounted = true;

    async function fetchImage() {
      if (existingImageUrl || (!imagePrompt && !imageLabel)) return;
      setImageLoading(true);
      setImageError(null);
      try {
        const res = await fetch("/api/video/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sceneId: `scene-${sceneNumber}`,
            imagePrompt,
            sceneTitle: imageLabel,
            location,
            mood: sceneMood,
            projectId,
            draftId,
            sceneNumber,
            characterNames,
            characterAppearances
          })
        });
        const data = await res.json();
        if (!mounted) return;
        if (!res.ok || !data.imageUrl) throw new Error(data.error ?? "Scene image generation failed.");
        setImageUrl(data.imageUrl);
        onUpdate?.({ imageUrl: data.imageUrl });
      } catch (err) {
        if (!mounted) return;
        setImageError(err instanceof Error ? err.message : "Scene image generation failed.");
      } finally {
        if (mounted) setImageLoading(false);
      }
    }

    async function fetchNarration() {
      if (existingNarrationUrl || !narrationText.trim()) return;
      setNarrationLoading(true);
      setNarrationError(null);
      try {
        const res = await fetch("/api/story/narrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: narrationText, draftId, sceneNumber, projectId })
        });
        const data = await res.json();
        if (!mounted) return;
        if (!res.ok || !data.audioUrl) throw new Error(data.error ?? "Narration generation failed.");
        setNarrationUrl(data.audioUrl);
        onUpdate?.({ narrationAudioUrl: data.audioUrl });
      } catch (err) {
        if (!mounted) return;
        setNarrationError(err instanceof Error ? err.message : "Narration generation failed.");
      } finally {
        if (mounted) setNarrationLoading(false);
      }
    }

    async function fetchMusic() {
      if (existingMusicUrl) return;
      setMusicLoading(true);
      setMusicError(null);
      try {
        const res = await fetch("/api/background-music", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mood: sceneMood,
            soundDesign: audioMoodPrompt,
            sceneTitle: imageLabel,
            sceneId: `scene-${sceneNumber}`,
            draftId,
            sceneNumber,
            projectId
          })
        });
        const data = await res.json();
        if (!mounted) return;
        if (!res.ok || !data.audioUrl) throw new Error(data.error ?? "Background music generation failed.");
        setMusicUrl(data.audioUrl);
        onUpdate?.({ musicUrl: data.audioUrl });
      } catch (err) {
        if (!mounted) return;
        setMusicError(err instanceof Error ? err.message : "Background music generation failed.");
      } finally {
        if (mounted) setMusicLoading(false);
      }
    }

    fetchImage();
    fetchNarration();
    fetchMusic();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneNumber]);

  return (
    <div className="space-y-4">
      <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-2">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={imageLabel}
            className="h-64 w-full rounded-[1.3rem] object-cover"
          />
        ) : (
          <div className="flex h-64 items-end rounded-[1.3rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(141,183,255,0.22),transparent_30%),linear-gradient(180deg,#161b39,#0a1022)] p-4">
            <p className="text-sm text-white/85">
              {imageLoading ? "Generating scene visual..." : imageError ?? imageLabel}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
        <p className="text-xs uppercase tracking-[0.26em] text-white/75">Narration Audio</p>
        <div className="mt-3">
          {narrationUrl ? (
            <audio controls src={narrationUrl} className="w-full" />
          ) : (
            <p className="text-sm text-white/70">
              {narrationLoading ? "Generating narration..." : narrationError ?? "Narration not available."}
            </p>
          )}
        </div>
        <p className="mt-3 text-sm text-white/90">
          {narrationLabel} • {narrationDuration}
        </p>
      </div>

      <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
        <p className="text-xs uppercase tracking-[0.26em] text-white/75">Background Music</p>
        <div className="mt-3">
          {musicUrl ? (
            <audio controls src={musicUrl} className="w-full" />
          ) : (
            <p className="text-sm text-white/70">
              {musicLoading ? "Generating background music..." : musicError ?? `Ambient ${backgroundMusicMood}`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
