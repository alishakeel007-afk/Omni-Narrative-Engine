import type { MovieScene } from "@/types/video";

/** Matches readiness's structural URL requirement without claiming playback. */
function hasUsableMediaReference(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export type VideoAudioSummary = {
  dialogueLines: number;
  dialogueClips: number;
  narrationRequired: number;
  narrationClips: number;
  failedDialogueLines: number;
  missingDialogueClips: number;
  missingNarrationClips: number;
  outdatedDialogueClips: number;
  outdatedNarrationClips: number;
  totalClips: number;
};

/** Counts playable persisted scene audio, never a historic provider response. */
export function summarizeVideoAudio(scenes: MovieScene[]): VideoAudioSummary {
  let dialogueLines = 0;
  let dialogueClips = 0;
  let narrationRequired = 0;
  let narrationClips = 0;
  let failedDialogueLines = 0;
  let outdatedDialogueClips = 0;
  let outdatedNarrationClips = 0;

  for (const scene of scenes) {
    if (scene.narration.trim()) {
      narrationRequired += 1;
      if (scene.narrationAudioOutdated) outdatedNarrationClips += 1;
      else if (hasUsableMediaReference(scene.narrationAudioUrl)) narrationClips += 1;
    }
    for (const dialogue of scene.dialogues) {
      if (!dialogue.line.trim()) continue;
      dialogueLines += 1;
      if (dialogue.audioError) failedDialogueLines += 1;
      else if (dialogue.audioOutdated) outdatedDialogueClips += 1;
      else if (hasUsableMediaReference(dialogue.audioUrl)) dialogueClips += 1;
    }
  }

  return {
    dialogueLines,
    dialogueClips,
    narrationRequired,
    narrationClips,
    failedDialogueLines,
    missingDialogueClips: dialogueLines - dialogueClips - failedDialogueLines - outdatedDialogueClips,
    missingNarrationClips: narrationRequired - narrationClips - outdatedNarrationClips,
    outdatedDialogueClips, outdatedNarrationClips,
    totalClips: dialogueClips + narrationClips,
  };
}

export function videoAudioStatus(summary: VideoAudioSummary, needsRegeneration: boolean): string {
  if (needsRegeneration) return "Needs regeneration";
  if (summary.outdatedDialogueClips > 0 || summary.outdatedNarrationClips > 0) return "Audio outdated";
  if (summary.failedDialogueLines > 0) return "Audio failed";
  if (summary.totalClips === 0) return summary.dialogueLines + summary.narrationRequired === 0 ? "No speech required" : "Not generated";
  if (summary.missingDialogueClips > 0 || summary.missingNarrationClips > 0) return "Partially ready";
  return "Ready";
}

export type VideoMusicSummary = {
  availableTracks: number;
  intentionalSilence: number;
  unavailable: number;
  failed: number;
  outdated: number;
};

export function summarizeVideoMusic(scenes: MovieScene[]): VideoMusicSummary {
  return scenes.reduce<VideoMusicSummary>((summary, scene) => {
    if (scene.backgroundMusicStatus === "silent") summary.intentionalSilence += 1;
    else if (scene.backgroundMusicStatus === "failed") summary.failed += 1;
    else if (scene.backgroundMusicOutdated) summary.outdated += 1;
    else if (hasUsableMediaReference(scene.backgroundMusicUrl)) summary.availableTracks += 1;
    else if (scene.backgroundMusicStatus === "unavailable" || scene.backgroundMusicStatus === "completed") summary.unavailable += 1;
    return summary;
  }, { availableTracks: 0, intentionalSilence: 0, unavailable: 0, failed: 0, outdated: 0 });
}

export function videoMusicStatus(summary: VideoMusicSummary): string {
  if (summary.failed > 0) return "Needs attention";
  if (summary.outdated > 0) return "Music outdated";
  if (summary.availableTracks > 0) return `${summary.availableTracks} track${summary.availableTracks === 1 ? "" : "s"} available`;
  if (summary.intentionalSilence > 0 && summary.unavailable === 0) return "Intentional silence";
  if (summary.unavailable > 0) return "No music tracks imported";
  return "No music selected";
}
