import type { CreateStoryDraft } from "@/types/create-story";

function isTransientMediaUrl(value: string | undefined) {
  return typeof value === "string" && /^(?:data|blob):/i.test(value);
}

/**
 * Browser-local TTS and image previews use data URLs so they do not create
 * orphaned Storage objects. Those URLs can be megabytes long and only work in
 * the current browser, so they must not be placed in the bounded server
 * snapshot. Persisted HTTPS media references are retained unchanged.
 */
export function prepareCustomDraftForPersistence(draft: CreateStoryDraft) {
  let omittedTransientMedia = false;
  const withoutTransient = (url: string | undefined) => {
    if (!isTransientMediaUrl(url)) return url;
    omittedTransientMedia = true;
    return undefined;
  };

  const scenes = draft.scenes.map((scene) => {
    const generatedImageUrl = withoutTransient(scene.generatedImageUrl);
    const narrationAudioUrl = withoutTransient(scene.narrationAudioUrl);
    const backgroundMusicUrl = withoutTransient(scene.backgroundMusicUrl);
    const dialogues = scene.dialogues.map((dialogue) => ({
      ...dialogue,
      audioUrl: withoutTransient(dialogue.audioUrl),
    }));

    return {
      ...scene,
      dialogues,
      generatedImageUrl,
      narrationAudioUrl,
      backgroundMusicUrl,
      ...(isTransientMediaUrl(scene.generatedImageUrl)
        ? { generatedImageStatus: "idle" as const, generatedImageError: undefined }
        : {}),
    };
  });

  const backgroundMusicUrl = withoutTransient(draft.audio.backgroundMusicUrl);
  return {
    draft: {
      ...draft,
      scenes,
      audio: {
        ...draft.audio,
        backgroundMusicUrl,
      },
    },
    omittedTransientMedia,
  };
}
