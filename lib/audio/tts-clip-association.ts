/** Stable, provider-independent association for returned TTS clips. */
export type ReturnedTtsClip = {
  sceneIdentity: string | number;
  dialogueId: string;
  audioUrl: string;
  storagePath?: string;
};

export function ttsClipKey(sceneIdentity: string | number, dialogueId: string) {
  return `${sceneIdentity}:${dialogueId}`;
}

export function indexReturnedTtsClips(clips: ReturnedTtsClip[]) {
  return new Map(clips.map((clip) => [ttsClipKey(clip.sceneIdentity, clip.dialogueId), clip] as const));
}
