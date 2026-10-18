"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

const MotionContext = createContext({ paused: true, toggle: () => {} });

export function PublicMotion({ children }: { children: React.ReactNode }) {
  const [paused, setPaused] = useState(true);
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
    setPaused(
      saved === "paused" || preference.matches || !!connection?.saveData,
    );
    const reduce = () => {
      if (preference.matches) setPaused(true);
    };
    preference.addEventListener("change", reduce);
    return () => preference.removeEventListener("change", reduce);
  }, []);
  const toggle = () =>
    setPaused((current) => {
      try {
        localStorage.setItem(
          "omni-public-motion",
          current ? "playing" : "paused",
        );
      } catch {
        /* Optional preference. */
      }
      return !current;
    });
  return (
    <MotionContext.Provider value={{ paused, toggle }}>
      {children}
    </MotionContext.Provider>
  );
}

export function MotionToggle({ compact = false }: { compact?: boolean }) {
  const { paused, toggle } = useContext(MotionContext);
  return (
    <button
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
}: {
  film?: "emerald-world" | "forest-light";
  priority?: boolean;
  className?: string;
}) {
  const { paused } = useContext(MotionContext);
  const container = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [source, setSource] = useState("");
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.05 },
    );
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const update = () => {
      if (paused || !visible || document.hidden) {
        element.pause();
        return;
      }
      if (!source) {
        const large =
          window.matchMedia("(min-width: 2000px)").matches &&
          (navigator.hardwareConcurrency || 2) >= 8;
        setSource(`/films/${film}-${large ? "4k" : "web"}.mp4`);
      } else
        void element.play().catch(() => {
          /* The poster stays visible if autoplay is blocked. */
        });
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [paused, visible, source, film]);
  return (
    <div
      ref={container}
      className={`public-cinema ${className}`}
      aria-hidden="true"
    >
      <img
        src={`/films/${film}-poster.jpg`}
        alt=""
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        className="public-cinema-poster"
      />
      <video
        ref={video}
        src={source || undefined}
        muted
        loop
        playsInline
        preload="none"
        poster={`/films/${film}-poster.jpg`}
        onCanPlay={() => setReady(true)}
        onError={() => setReady(false)}
        className={ready ? "ready" : ""}
      />
    </div>
  );
}
