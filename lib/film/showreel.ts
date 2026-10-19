/**
 * The clips the public pages play behind their copy.
 *
 * These are real output from this project's own pinned pipeline, already in
 * Supabase storage, so the landing page shows what the product actually makes
 * and costs nothing new to run. Overridable per deployment, because a fork will
 * not have these objects.
 *
 * The files referenced here used to be `/films/*.mp4` under `public/`, which
 * never existed in the repository — so the hero video 404'd and the poster
 * showed as a broken image. Anything listed here is verified to exist before
 * being added.
 */
export type ShowreelClip = {
  id: string;
  /** Playable MP4 (H.264/AAC, as the exporter writes). */
  src: string;
  poster: string;
  /** What it is, for the caption under the hero. */
  caption: string;
};

const FALLBACK: ShowreelClip[] = [
  {
    id: "emerald-world",
    poster: "/posters/emerald-world.jpg",
    src: "https://yliobvmshbmivwrnsjmp.supabase.co/storage/v1/object/public/generated-videos/studio/c7c89a51-96c9-4837-9314-328308999bad/validation-text.mp4",
    caption: "Generated from a written scene",
  },
  {
    id: "forest-light",
    poster: "/posters/forest-light.jpg",
    src: "https://yliobvmshbmivwrnsjmp.supabase.co/storage/v1/object/public/generated-videos/studio/c7c89a51-96c9-4837-9314-328308999bad/validation-image.mp4",
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
  if (!configured.length) return FALLBACK;
  return configured.map((src, index) => ({
    id: `clip-${index}`,
    src,
    poster: FALLBACK[index]?.poster ?? FALLBACK[0].poster,
    caption: FALLBACK[index]?.caption ?? "Generated with OmniNarrative",
  }));
}

export function showreelClip(id: string): ShowreelClip {
  const clips = showreel();
  return clips.find((clip) => clip.id === id) ?? clips[0];
}
