import type { MovieScene } from "@/types/video";

/** Persisted inside StoryDraft.videoStudioState; keyed by immutable Scene.id. */
export type SceneMediaFreshness = {
  image?: true;
  narration?: true;
  music?: true;
  dialogueIndices?: number[];
};

export type VideoMediaFreshness = Record<string, SceneMediaFreshness>;

export function collectVideoMediaFreshness(scenes: MovieScene[]): VideoMediaFreshness {
  return Object.fromEntries(scenes.flatMap((scene) => {
    if (!scene.persistenceSceneId) return [];
    const dialogueIndices = scene.dialogues.flatMap((line, index) => line.audioOutdated ? [index] : []);
    const state: SceneMediaFreshness = {
      ...(scene.generatedImageOutdated ? { image: true } : {}),
      ...(scene.narrationAudioOutdated ? { narration: true } : {}),
      ...(scene.backgroundMusicOutdated ? { music: true } : {}),
      ...(dialogueIndices.length ? { dialogueIndices } : {}),
    };
    return Object.keys(state).length ? [[scene.persistenceSceneId, state]] : [];
  })) as VideoMediaFreshness;
}

export function applyVideoMediaFreshness<T extends MovieScene>(scene: T, freshness?: SceneMediaFreshness): T {
  if (!freshness) return scene;
  const staleLines = new Set(freshness.dialogueIndices ?? []);
  return {
    ...scene,
    ...(freshness.image ? { generatedImageOutdated: true } : {}),
    ...(freshness.narration ? { narrationAudioOutdated: true } : {}),
    ...(freshness.music ? { backgroundMusicOutdated: true } : {}),
    dialogues: scene.dialogues.map((line, index) => staleLines.has(index) ? { ...line, audioOutdated: true } : line),
  };
}
