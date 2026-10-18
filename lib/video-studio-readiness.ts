import type { MovieScene } from "@/types/video";

export type MediaReadinessStatus = "ready" | "missing" | "generating" | "failed" | "outdated" | "not_required";

export type SceneMediaReadiness = {
  image: MediaReadinessStatus;
  narration: MediaReadinessStatus;
  dialogue: MediaReadinessStatus;
  music: MediaReadinessStatus;
};

export type MediaValidationStatus = "ready" | "needs_attention" | "unavailable";
/** Controls which workflow stage is allowed to treat missing media as actionable. */
export type MediaValidationScope = "all" | "authoring" | "voice" | "image" | "music";

export type SceneMediaValidation = {
  status: MediaValidationStatus;
  issues: string[];
  /** A client-side structural check only; it never proves remote availability or ownership. */
  remoteAvailability: "unverified";
};

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "aac"]);

type UrlCheck = "valid" | "unsupported" | "malformed" | "unavailable";

/**
 * A saved HTTP(S) reference is the minimum evidence for a usable asset. It
 * intentionally does not perform a network request, so it never claims the
 * object is remotely playable or still accessible.
 */
export function hasUsableMediaReference(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function checkMediaUrl(value: string | undefined, extensions: Set<string>): UrlCheck {
  if (!value?.trim()) return "malformed";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "malformed";
    const filename = url.pathname.split("/").pop() ?? "";
    const extension = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() : undefined;
    return !extension ? "unavailable" : extensions.has(extension) ? "valid" : "unsupported";
  } catch {
    return "malformed";
  }
}

function addUrlIssue(issues: string[], label: string, check: UrlCheck) {
  if (check === "malformed") issues.push(`${label} has an invalid media reference.`);
  if (check === "unsupported") issues.push(`${label} uses an unsupported format.`);
  if (check === "unavailable") issues.push(`${label} format cannot be verified from its saved URL.`);
}

/**
 * Validates only local, persisted scene fields. No remote URL is requested and
 * a structurally valid URL remains explicitly unverified until playback/storage
 * access is exercised by the user.
 */
export function validateSceneMedia(scene: MovieScene, scope: MediaValidationScope = "all"): SceneMediaValidation {
  const issues: string[] = [];
  const readiness = getSceneMediaReadiness(scene);

  if (readiness.image === "failed") issues.push("Image generation failed; keep the previous image or retry generation.");
  else if (readiness.image === "outdated") issues.push("Scene image is outdated — regenerate recommended.");
  else if (readiness.image === "missing") issues.push("Scene image is missing.");
  else if (readiness.image === "ready") addUrlIssue(issues, "Scene image", checkMediaUrl(scene.generatedImageUrl, IMAGE_EXTENSIONS));

  if (readiness.narration === "missing") issues.push("Narration audio is missing.");
  else if (readiness.narration === "outdated") issues.push("Narration audio is outdated — regenerate recommended.");
  else if (readiness.narration === "ready") addUrlIssue(issues, "Narration audio", checkMediaUrl(scene.narrationAudioUrl, AUDIO_EXTENSIONS));

  if (readiness.dialogue === "failed") issues.push("One or more dialogue lines failed to generate.");
  else if (readiness.dialogue === "outdated") issues.push("One or more dialogue clips are outdated — regenerate recommended.");
  else if (readiness.dialogue === "missing") issues.push("Dialogue audio is missing for one or more spoken lines.");
  else if (readiness.dialogue === "ready") {
    scene.dialogues.filter((line) => line.line.trim()).forEach((line) => {
      const urlCheck = checkMediaUrl(line.audioUrl, AUDIO_EXTENSIONS);
      const mime = line.audioMimeType?.toLowerCase();
      if (mime && !mime.startsWith("audio/")) issues.push(`Dialogue audio for ${line.character || "a character"} has an unsupported format.`);
      else addUrlIssue(issues, `Dialogue audio for ${line.character || "a character"}`, urlCheck);
    });
  }

  if (readiness.music === "failed") issues.push("Background music operation failed.");
  else if (readiness.music === "outdated") issues.push("Background music is outdated — regenerate recommended.");
  else if (readiness.music === "missing") issues.push("Background music is required for this scene but is missing.");
  else if (readiness.music === "ready") addUrlIssue(issues, "Background music", checkMediaUrl(scene.backgroundMusicUrl, AUDIO_EXTENSIONS));
  // not_required intentionally includes both no dialogue/narration and music silence.

  const isMissingMediaIssue = (issue: string) =>
    issue === "Scene image is missing." ||
    issue === "Narration audio is missing." ||
    issue === "Dialogue audio is missing for one or more spoken lines." ||
    issue === "Background music is required for this scene but is missing.";
  const isInScope = (issue: string) => {
    const normalizedIssue = issue.toLowerCase();
    if (scope === "all") return true;
    if (scope === "authoring") return !isMissingMediaIssue(issue);
    if (scope === "image") return normalizedIssue.includes("image");
    if (scope === "music") return normalizedIssue.includes("music");
    return normalizedIssue.includes("narration") || normalizedIssue.includes("dialogue");
  };
  const scopedIssues = issues.filter(isInScope);
  const hasUnverifiableFormat = scopedIssues.some((issue) => issue.includes("cannot be verified"));
  return {
    status: scopedIssues.length === 0 ? "ready" : hasUnverifiableFormat && scopedIssues.length === 1 ? "unavailable" : "needs_attention",
    issues: scopedIssues,
    remoteAvailability: "unverified",
  };
}

/** Converts only persisted/current scene fields into user-facing readiness. */
export function getSceneMediaReadiness(scene: MovieScene): SceneMediaReadiness {
  const image = scene.generatedImageStatus === "generating"
    ? "generating"
    : scene.generatedImageStatus === "failed"
      ? "failed"
      : scene.generatedImageOutdated ? "outdated"
      : hasUsableMediaReference(scene.generatedImageUrl)
        ? "ready"
        : "missing";
  const narration = !scene.narration.trim() ? "not_required" : scene.narrationAudioOutdated ? "outdated" : hasUsableMediaReference(scene.narrationAudioUrl) ? "ready" : "missing";
  const spokenLines = scene.dialogues.filter((line) => line.line.trim());
  const dialogue = spokenLines.length === 0
    ? "not_required"
    : spokenLines.some((line) => line.audioError)
      ? "failed"
      : spokenLines.some((line) => line.audioOutdated)
        ? "outdated"
      : spokenLines.every((line) => hasUsableMediaReference(line.audioUrl)) ? "ready" : "missing";
  const music = scene.backgroundMusicStatus === "silent"
    ? "not_required"
    : scene.backgroundMusicStatus === "generating"
      ? "generating"
      : scene.backgroundMusicStatus === "failed"
        ? "failed"
        : scene.backgroundMusicOutdated ? "outdated"
        : hasUsableMediaReference(scene.backgroundMusicUrl) ? "ready" : "missing";
  return { image, narration, dialogue, music };
}

export const MEDIA_READINESS_LABEL: Record<MediaReadinessStatus, string> = {
  ready: "Ready", missing: "Missing", generating: "Generating", failed: "Failed", outdated: "Outdated — regenerate recommended", not_required: "Not required",
};
