"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { showreelClip } from "@/lib/film/showreel";

/**
 * Background video for the public pages.
 *
 * Autoplay only works when the element is muted, inline and marked autoplay
 * BEFORE the browser decides — not by calling `play()` later — so those are set
 * on the element itself. Motion starts on unless the visitor asked for less
 * (`prefers-reduced-motion`) or is saving data; a blocked autoplay or a missing
 * file leaves the flat surface showing rather than a broken frame.
 */
const MotionContext = createContext({ paused: true, canLoad: false, toggle: () => {} });

export function PublicMotion({ children }: { children: React.ReactNode }) {
  // Resolve motion/data preferences before mounting media. With no restriction
  // or saved pause, playback starts automatically after hydration.
  const [paused, setPaused] = useState(true);
  const [canLoad, setCanLoad] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("omni-public-motion");
    } catch {
      /* Optional preference. */
    }
    const stop = saved === "paused" || (saved !== "playing" && (preference.matches || !!connection?.saveData));
    setPaused(stop);
    setCanLoad(!stop);
    const reduce = () => {
      if (preference.matches) setPaused(true);
    };
    preference.addEventListener("change", reduce);
    return () => preference.removeEventListener("change", reduce);
  }, []);
  const toggle = () =>
    setPaused((current) => {
      try {
        localStorage.setItem("omni-public-motion", current ? "playing" : "paused");
      } catch {
        /* Optional preference. */
      }
      if (current) setCanLoad(true);
      return !current;
    });
  return (
    <MotionContext.Provider value={{ paused, canLoad, toggle }}>
      {children}
    </MotionContext.Provider>
  );
}

export function MotionToggle({ compact = false }: { compact?: boolean }) {
  const { paused, toggle } = useContext(MotionContext);
  return (
    <button
      type="button"
      className={`public-motion-toggle ${compact ? "compact" : ""}`}
      onClick={toggle}
      aria-label={paused ? "Play background videos" : "Pause background videos"}
      aria-pressed={!paused}
      title={paused ? "Play background videos" : "Pause background videos"}
    >
      {paused ? <Play size={14} /> : <Pause size={14} />}
      {!compact && <span>{paused ? "Play motion" : "Pause motion"}</span>}
    </button>
  );
}

export function CinematicVideo({
  film = "emerald-world",
  priority = false,
  className = "",
  audioControl = false,
}: {
  film?: string;
  priority?: boolean;
  className?: string;
  /** Decorative playback remains muted until the visitor explicitly enables sound. */
  audioControl?: boolean;
}) {
  const { paused, canLoad } = useContext(MotionContext);
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const clip = showreelClip(film);
  // Only mounted once it has been near the viewport, so a page with four of
  // these does not fetch four videos at once.
  const [near, setNear] = useState(priority);
  const [visible, setVisible] = useState(priority);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [soundOn, setSoundOn] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) setNear(true);
      },
      { threshold: 0.05, rootMargin: "200px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Playback follows what the visitor can see and what they asked for. A
  // rejected play() is expected on some browsers and must not throw.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const update = () => {
      if (paused || !visible || document.hidden) element.pause();
      else void element.play().catch(() => undefined);
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [paused, visible, near]);

  return (
    <div ref={container} className={`public-cinema ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={clip.poster} alt="" className="public-cinema-poster" loading={priority ? "eager" : "lazy"} />
      {near && canLoad && !failed ? (
        <video
          ref={video}
          src={clip.src}
          poster={clip.poster}
          autoPlay={!paused}
          muted={!soundOn}
          loop
          playsInline
          disablePictureInPicture
          // `metadata` is enough to show a first frame; the rest streams.
          preload={priority ? "auto" : "metadata"}
          onLoadedData={() => setReady(true)}
          onError={() => {
            // A missing or unplayable file degrades to the flat surface.
            setReady(false);
            setFailed(true);
          }}
          className={ready ? "ready" : ""}
        />
      ) : null}
      {audioControl ? <button
        type="button"
        className="public-video-sound"
        aria-label={soundOn ? "Mute video sound" : "Play video sound"}
        aria-pressed={soundOn}
        onClick={() => {
          setSoundOn((current) => !current);
          if (!soundOn) void video.current?.play().catch(() => undefined);
        }}
      >
        {soundOn ? <Volume2 size={15} aria-hidden /> : <VolumeX size={15} aria-hidden />}
      </button> : null}
    </div>
  );
}
