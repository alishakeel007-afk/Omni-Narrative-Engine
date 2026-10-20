/**
 * The clips the public pages play behind their copy.
 *
 * The hero is a local LTX scene with music and its own first-frame poster. The
 * example scenes are generated output in storage, each with a matching poster.
 */
export type ShowreelClip = {
  id: string;
  /** Playable MP4 (H.264/AAC, as the exporter writes). */
  src: string;
  poster?: string;
  /** What it is, for the caption under the hero. */
  caption: string;
};

const HERO: ShowreelClip = {
  id: "ltx-hero-20s",
  poster: "/posters/ltx-hero-20s.jpg",
  src: "/films/ltx-hero-20s.mp4",
  caption: "A 20-second scene generated with LTX and native stereo audio",
};

const FALLBACK: ShowreelClip[] = [
  {
    id: "emerald-world",
    poster: "/posters/emerald-world-frame.jpg",
    src: "https://yliobvmshbmivwrnsjmp.supabase.co/storage/v1/object/public/generated-videos/studio/public-showreel/emerald-world/emerald-world.mp4",
    caption: "Generated from a reference image",
  },
  {
    id: "forest-light",
    poster: "/posters/forest-light-frame.jpg",
    src: "https://yliobvmshbmivwrnsjmp.supabase.co/storage/v1/object/public/generated-videos/studio/public-showreel/forest-light/forest-light.mp4",
    caption: "Generated from a written scene",
  },
  {
    id: "final-story",
    poster: "/posters/final-story-frame.jpg",
    src: "https://yliobvmshbmivwrnsjmp.supabase.co/storage/v1/object/public/generated-videos/studio/public-showreel/final-story/final-story.mp4",
    caption: "Generated from a reference image",
  },
];

/**
 * `NEXT_PUBLIC_SHOWREEL_CLIPS` is a comma-separated list of MP4 URLs. It is
 * public on purpose: these are decorative, already-public objects, and the
 * browser has to fetch them.
 */
export function showreel(): ShowreelClip[] {
  const configured = (process.env.NEXT_PUBLIC_SHOWREEL_CLIPS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^https:\/\/\S+\.(mp4|webm)$/i.test(value));
  if (!configured.length) return [HERO, ...FALLBACK];
  return [HERO, ...configured.map((src, index) => ({
    id: FALLBACK[index]?.id ?? `clip-${index}`,
    src,
    // A custom video must not briefly show an unrelated default poster.
    caption: FALLBACK[index]?.caption ?? "Generated with OmniNarrative",
  }))];
}

export function showreelClip(id: string): ShowreelClip {
  const clips = showreel();
  return clips.find((clip) => clip.id === id) ?? clips[0];
}
