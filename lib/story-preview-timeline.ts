import type { MovieScene } from "@/types/video";

export const VISUAL_ONLY_SCENE_DURATION_MS = 8_000;

export type StoryPreviewClip = {
  id: string;
  kind: "narration" | "dialogue";
  url: string;
  label: string;
};

export type StoryPreviewTimelineScene = {
  id: string;
  sceneNumber: number;
  title: string;
  imageUrl?: string;
  musicUrl?: string;
  intentionallySilent: boolean;
  clips: StoryPreviewClip[];
  missing: string[];
  outdated: string[];
  fallbackDurationMs: number;
};

function isPlayableUrl(value: string | undefined) {
  if (!value?.trim()) return false;
  // Browser-local Custom Mode deliberately uses bounded data URLs before an
  // author chooses Save to My Projects. They are safe to preview locally and
  // never imply that media has been persisted server-side.
  if (/^data:(audio|image)\/[a-z0-9.+-]+;base64,/i.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Builds an ordered, browser-only preview plan. Persisted scene identity is
 * used for React/audio ownership while the incoming array remains the saved
 * display order from Step 113.
 */
export function buildStoryPreviewTimeline(scenes: MovieScene[]): StoryPreviewTimelineScene[] {
  return scenes.map((scene, index) => {
    const missing: string[] = [];
    const outdated: string[] = [];
    const clips: StoryPreviewClip[] = [];
    const sceneId = scene.persistenceSceneId || `scene-${scene.sceneNumber}-${index}`;

    if (scene.generatedImageOutdated) outdated.push("Scene image");
    else if (scene.generatedImageStatus === "failed") missing.push("Scene image failed");
    else if (!isPlayableUrl(scene.generatedImageUrl)) missing.push("Scene image");

    if (scene.narration.trim()) {
      if (scene.narrationAudioOutdated) outdated.push("Narration audio");
      else if (isPlayableUrl(scene.narrationAudioUrl)) {
        clips.push({ id: `${sceneId}:narration`, kind: "narration", url: scene.narrationAudioUrl!, label: "Narration" });
      } else {
        missing.push("Narration audio");
      }
    }

    scene.dialogues.forEach((dialogue, dialogueIndex) => {
      if (!dialogue.line.trim()) return;
      if (dialogue.audioOutdated) {
        outdated.push(`Dialogue audio: ${dialogue.character || `line ${dialogueIndex + 1}`}`);
      } else if (dialogue.audioError) {
        missing.push(`Dialogue audio failed: ${dialogue.character || `line ${dialogueIndex + 1}`}`);
      } else if (isPlayableUrl(dialogue.audioUrl)) {
        clips.push({
          id: dialogue.id || `${sceneId}:dialogue:${dialogueIndex}`,
          kind: "dialogue",
          url: dialogue.audioUrl!,
          label: dialogue.character || `Dialogue ${dialogueIndex + 1}`,
        });
      } else {
        missing.push(`Dialogue audio: ${dialogue.character || `line ${dialogueIndex + 1}`}`);
      }
    });

    const intentionallySilent = scene.backgroundMusicStatus === "silent";
    let musicUrl: string | undefined;
    if (scene.backgroundMusicOutdated) outdated.push("Background music");
    else if (!intentionallySilent && isPlayableUrl(scene.backgroundMusicUrl)) musicUrl = scene.backgroundMusicUrl;
    else if (!intentionallySilent && scene.backgroundMusicStatus === "failed") missing.push("Background music failed");

    return {
      id: sceneId,
      sceneNumber: scene.sceneNumber,
      title: scene.title,
      imageUrl: !scene.generatedImageOutdated && isPlayableUrl(scene.generatedImageUrl) ? scene.generatedImageUrl : undefined,
      musicUrl,
      intentionallySilent,
      clips,
      missing,
      outdated,
      fallbackDurationMs: VISUAL_ONLY_SCENE_DURATION_MS,
    };
  });
}
