"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import type { MovieScene } from "@/types/video";
import { buildStoryPreviewTimeline, type StoryPreviewTimelineScene } from "@/lib/story-preview-timeline";

type PlaybackState = "idle" | "playing" | "paused" | "ended";

const MUSIC_VOLUME = 0.3;
const DUCKED_MUSIC_VOLUME = 0.1;

export function SynchronizedStoryPreview({
  scenes,
  language,
  projectKey,
}: {
  scenes: MovieScene[];
  language: "en" | "ur";
  /** A project change is an explicit lifecycle boundary for browser audio. */
  projectKey?: string;
}) {
  const timeline = useMemo(() => buildStoryPreviewTimeline(scenes), [scenes]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>("idle");
  const [sceneIndex, setSceneIndex] = useState(0);
  const [clipIndex, setClipIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const bgmRefA = useRef<HTMLAudioElement | null>(null);
  const bgmRefB = useRef<HTMLAudioElement | null>(null);
  const activeBgm = useRef<"A" | "B">("A");
  const sceneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneTimerStartedAt = useRef(0);
  const sceneTimerRemainingMs = useRef(0);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimers = useRef(new Map<HTMLAudioElement, ReturnType<typeof setInterval>>());
  const playbackStateRef = useRef<PlaybackState>("idle");
  const currentSceneRef = useRef(0);
  const currentClipRef = useRef(0);
  /** Invalidates delayed callbacks after restart, navigation, or project changes. */
  const playbackRunRef = useRef(0);

  const currentScene = timeline[sceneIndex];
  // A saved scene is still previewable with the clean visual placeholder and
  // conservative timing when optional media is unavailable.
  const hasPreviewableContent = timeline.length > 0;

  const clearTimers = () => {
    if (sceneTimer.current) clearTimeout(sceneTimer.current);
    sceneTimer.current = null;
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = null;
    for (const timer of fadeTimers.current.values()) clearInterval(timer);
    fadeTimers.current.clear();
  };

  const fadeAudio = (audio: HTMLAudioElement, targetVolume: number, duration = 700) => {
    const previous = fadeTimers.current.get(audio);
    if (previous) clearInterval(previous);
    const start = audio.volume;
    const steps = 14;
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      audio.volume = Math.max(0, Math.min(1, start + ((targetVolume - start) * step) / steps));
      if (step >= steps) {
        clearInterval(timer);
        fadeTimers.current.delete(audio);
        if (targetVolume === 0) audio.pause();
      }
    }, duration / steps);
    fadeTimers.current.set(audio, timer);
  };

  const activeMusic = () => activeBgm.current === "A" ? bgmRefA.current : bgmRefB.current;

  const startMusicForScene = (scene: StoryPreviewTimelineScene, run: number) => {
    const current = activeMusic();
    const next = activeBgm.current === "A" ? bgmRefB.current : bgmRefA.current;
    if (!current || !next) return;
    if (!scene.musicUrl) {
      if (!current.paused) fadeAudio(current, 0);
      return;
    }
    if (current.src === scene.musicUrl && !current.paused) return;
    next.pause();
    next.currentTime = 0;
    next.src = scene.musicUrl;
    next.loop = true;
    next.volume = 0;
    void next.play().then(() => {
      if (run !== playbackRunRef.current || playbackStateRef.current !== "playing") { next.pause(); return; }
      fadeAudio(next, scene.clips.length ? DUCKED_MUSIC_VOLUME : MUSIC_VOLUME);
    }).catch(() => {
      if (run !== playbackRunRef.current) return;
      setError(`Background music for Scene ${scene.sceneNumber} could not be played. The story preview will continue.`);
    });
    if (!current.paused) fadeAudio(current, 0);
    activeBgm.current = activeBgm.current === "A" ? "B" : "A";
  };

  const stopAll = (resetProgress = false) => {
    playbackRunRef.current += 1;
    clearTimers();
    [voiceRef.current, bgmRefA.current, bgmRefB.current].forEach((audio) => {
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
    });
    playbackStateRef.current = "idle";
    setPlaybackState("idle");
    if (resetProgress) {
      currentSceneRef.current = 0;
      currentClipRef.current = 0;
      setSceneIndex(0);
      setClipIndex(0);
      setProgress(0);
    }
  };

  const updateProgress = () => {
    const total = Math.max(1, timeline.length);
    const scene = timeline[currentSceneRef.current];
    const activeVoice = voiceRef.current;
    const withinClip = activeVoice && Number.isFinite(activeVoice.duration) && activeVoice.duration > 0
      ? Math.max(0, Math.min(1, activeVoice.currentTime / activeVoice.duration))
      : 0;
    const clipProgress = scene?.clips.length
      ? Math.min(1, (currentClipRef.current + withinClip) / scene.clips.length)
      : sceneTimer.current
        ? Math.min(0.99, Math.max(0, (Date.now() - sceneTimerStartedAt.current) / Math.max(1, sceneTimerRemainingMs.current)))
        : 0;
    setProgress(Math.min(100, ((currentSceneRef.current + clipProgress) / total) * 100));
  };

  const beginProgressUpdates = () => {
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = setInterval(updateProgress, 250);
  };

  const scheduleVisualScene = (durationMs: number, advance: () => void, run: number) => {
    sceneTimerRemainingMs.current = durationMs;
    sceneTimerStartedAt.current = Date.now();
    sceneTimer.current = setTimeout(() => { if (run === playbackRunRef.current && playbackStateRef.current === "playing") advance(); }, durationMs);
  };

  const playFrom = (nextSceneIndex: number, nextClipIndex = 0, run = playbackRunRef.current) => {
    if (run !== playbackRunRef.current || playbackStateRef.current !== "playing") return;
    const scene = timeline[nextSceneIndex];
    if (!scene) {
      clearTimers();
      [bgmRefA.current, bgmRefB.current].forEach((audio) => audio && !audio.paused && fadeAudio(audio, 0, 1000));
      playbackStateRef.current = "ended";
      setPlaybackState("ended");
      setProgress(100);
      return;
    }
    currentSceneRef.current = nextSceneIndex;
    currentClipRef.current = nextClipIndex;
    setSceneIndex(nextSceneIndex);
    setClipIndex(nextClipIndex);
    startMusicForScene(scene, run);
    updateProgress();

    const nextScene = () => playFrom(nextSceneIndex + 1, 0, run);
    const clip = scene.clips[nextClipIndex];
    if (!clip) {
      scheduleVisualScene(scene.fallbackDurationMs, nextScene, run);
      return;
    }
    const voice = voiceRef.current;
    if (!voice) return;
    voice.pause();
    voice.currentTime = 0;
    voice.src = clip.url;
    voice.onended = () => {
      if (run !== playbackRunRef.current || playbackStateRef.current !== "playing") return;
      const music = activeMusic();
      if (music && !music.paused) fadeAudio(music, MUSIC_VOLUME, 350);
      if (nextClipIndex + 1 < scene.clips.length) playFrom(nextSceneIndex, nextClipIndex + 1, run);
      else nextScene();
    };
    voice.onerror = () => {
      if (run !== playbackRunRef.current || playbackStateRef.current !== "playing") return;
      setError(`${clip.label} in Scene ${scene.sceneNumber} could not be played and was skipped.`);
      if (nextClipIndex + 1 < scene.clips.length) playFrom(nextSceneIndex, nextClipIndex + 1, run);
      else nextScene();
    };
    const music = activeMusic();
    if (music && !music.paused) fadeAudio(music, DUCKED_MUSIC_VOLUME, 250);
    void voice.play().catch(() => {
      if (run !== playbackRunRef.current || playbackStateRef.current !== "playing") return;
      setError(`${clip.label} in Scene ${scene.sceneNumber} could not be started. Check the saved audio and try again.`);
      if (nextClipIndex + 1 < scene.clips.length) playFrom(nextSceneIndex, nextClipIndex + 1, run);
      else nextScene();
    });
  };

  const start = (startAt = playbackStateRef.current === "ended" ? 0 : sceneIndex) => {
    if (!timeline.length) return;
    const run = playbackRunRef.current + 1;
    playbackRunRef.current = run;
    setError(null);
    clearTimers();
    [voiceRef.current, bgmRefA.current, bgmRefB.current].forEach((audio) => { if (audio) { audio.pause(); audio.currentTime = 0; } });
    playbackStateRef.current = "playing";
    setPlaybackState("playing");
    beginProgressUpdates();
    playFrom(startAt >= timeline.length ? 0 : startAt, 0, run);
  };

  const pause = () => {
    if (playbackStateRef.current !== "playing") return;
    if (sceneTimer.current) {
      clearTimeout(sceneTimer.current);
      sceneTimer.current = null;
      sceneTimerRemainingMs.current = Math.max(0, sceneTimerRemainingMs.current - (Date.now() - sceneTimerStartedAt.current));
    }
    [voiceRef.current, bgmRefA.current, bgmRefB.current].forEach((audio) => audio?.pause());
    if (progressTimer.current) clearInterval(progressTimer.current);
    progressTimer.current = null;
    playbackStateRef.current = "paused";
    setPlaybackState("paused");
  };

  const resume = () => {
    if (playbackStateRef.current !== "paused") return;
    const scene = timeline[currentSceneRef.current];
    if (!scene) return;
    playbackStateRef.current = "playing";
    setPlaybackState("playing");
    beginProgressUpdates();
    const music = activeMusic();
    if (music?.src) void music.play().catch(() => undefined);
    if (voiceRef.current?.src && !voiceRef.current.ended) {
      void voiceRef.current.play().catch(() => undefined);
    } else if (sceneTimerRemainingMs.current > 0) {
      const remaining = sceneTimerRemainingMs.current;
      scheduleVisualScene(remaining, () => playFrom(currentSceneRef.current + 1, 0), playbackRunRef.current);
    } else {
      playFrom(currentSceneRef.current, currentClipRef.current, playbackRunRef.current);
    }
  };

  const restart = () => {
    stopAll(true);
    setError(null);
    start(0);
  };

  useEffect(() => {
    // Project changes and unmounts are hard stop boundaries: browser audio must
    // never leak into another project or route.
    stopAll(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  useEffect(() => () => stopAll(false), []);

  if (!currentScene) {
    return <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-6 text-sm text-white/70">No saved scenes are available for preview.</div>;
  }

  const isRtl = language === "ur";
  return (
    <section className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-black/35">
      <div className="relative flex min-h-[22rem] items-end overflow-hidden bg-slate-950 sm:min-h-[30rem]">
        {currentScene.imageUrl ? (
          <img src={currentScene.imageUrl} alt={currentScene.title} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),transparent_55%)]">
            <span className="rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm text-white/70">Scene image unavailable</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10" />
        <div className="relative z-10 w-full p-5 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gold">Scene {currentScene.sceneNumber} of {timeline.length}</p>
          <h2 aria-live="polite" dir={isRtl ? "rtl" : undefined} className={`mt-2 font-[var(--font-heading)] text-2xl text-white sm:text-4xl ${isRtl ? "text-right" : ""}`}>{currentScene.title}</h2>
          <div role="group" aria-label="Story preview controls" className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => playbackState === "playing" ? pause() : playbackState === "paused" ? resume() : start()} disabled={!hasPreviewableContent} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-5 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
              {playbackState === "playing" ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
              {playbackState === "playing" ? "Pause Story" : playbackState === "paused" ? "Resume Story" : playbackState === "ended" ? "Play Again" : "Play Complete Story"}
            </button>
            <button type="button" onClick={restart} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-black/30 px-4 py-3 text-sm font-semibold text-white/85 sm:w-auto"><RotateCcw className="h-4 w-4" />Restart</button>
            <span className="inline-flex items-center gap-2 text-xs text-white/75"><Volume2 className="h-4 w-4 text-starlight" />{currentScene.intentionallySilent ? "Intentional silence" : currentScene.musicUrl ? "Scene music" : "No music track"}</span>
          </div>
          <div role="progressbar" aria-label="Overall story playback progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gradient-to-r from-aurora to-gold transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>
          <p className="mt-2 text-xs text-white/70">{Math.round(progress)}% complete {currentScene.clips[clipIndex] ? `• ${currentScene.clips[clipIndex].label}` : "• visual transition"}</p>
        </div>
      </div>
      {(currentScene.missing.length > 0 || currentScene.outdated.length > 0 || error) ? <div role="status" aria-live="polite" className="space-y-2 border-t border-white/10 bg-black/30 p-4 text-sm">
        {currentScene.outdated.length > 0 ? <p className="font-medium text-amber-100">Outdated — regenerate recommended: {currentScene.outdated.join(", ")}.</p> : null}
        {currentScene.missing.length > 0 ? <p className="text-white/70">Unavailable for this preview: {currentScene.missing.join(", ")}.</p> : null}
        {error ? <p role="alert" className="font-medium text-red-100">{error}</p> : null}
      </div> : null}
      <audio ref={voiceRef} className="hidden" />
      <audio ref={bgmRefA} className="hidden" />
      <audio ref={bgmRefB} className="hidden" />
    </section>
  );
}
