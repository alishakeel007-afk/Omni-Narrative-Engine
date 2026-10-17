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

  const generatedForScene = useRef<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const sceneKey = `${draftId ?? projectId ?? "unsaved"}:${sceneNumber}`;

  useEffect(() => {
    const generationKey = `${sceneKey}:${retryNonce}`;
    if (generatedForScene.current === generationKey) return;
    generatedForScene.current = generationKey;

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
            narration: narrationText,
            // Interactive Story owns its in-progress scene in browser state.
            // The server still runs this context through the shared semantic
            // visual planner before it reaches an image provider.
            storyDescription: narrationText,
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

    fetchImage();
    fetchNarration();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey, retryNonce]);

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
        {narrationError ? (
          <button type="button" onClick={() => setRetryNonce((value) => value + 1)} disabled={narrationLoading} className="mt-3 text-sm font-medium text-gold disabled:opacity-50">
            Retry unavailable media
          </button>
        ) : null}
      </div>

      <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
        <p className="text-xs uppercase tracking-[0.26em] text-white/75">Background Music</p>
        <div className="mt-3">
          {musicUrl ? (
            <audio controls src={musicUrl} className="w-full" />
          ) : (
            <p className="text-sm text-white/70">
              {musicLoading ? "Selecting approved background music..." : musicError ?? `No saved music. Scene-aware music is optional.`}
            </p>
          )}
        </div>
        {imageError || musicError ? (
          <button type="button" onClick={() => setRetryNonce((value) => value + 1)} disabled={imageLoading || musicLoading} className="mt-3 text-sm font-medium text-gold disabled:opacity-50">
            Retry unavailable media
          </button>
        ) : null}
      </div>
    </div>
  );
}
