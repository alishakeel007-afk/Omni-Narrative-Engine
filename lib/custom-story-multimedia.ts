import { decideSceneMusic, type SceneMusicDecision } from "@/lib/audio/music-policy";
import type { MovieCharacterVoice, MovieDialogueLine, MovieScene, VideoGenerationResponse } from "@/types/video";
import type { CreateStoryCharacter, CreateStoryDraft, CreateStoryScene } from "@/types/create-story";
import {
  customAudioFingerprint,
  customDialogueVoiceConfiguration,
  customNarrationVoiceConfiguration,
  isCurrentCustomAudio,
} from "@/lib/custom-story-audio-freshness";
import { indexReturnedTtsClips, ttsClipKey } from "@/lib/audio/tts-clip-association";

const NARRATION_PREFIX = "custom-narration:";

function narrationText(scene: CreateStoryScene) {
  return scene.storyDescription || scene.selectedSuggestion;
}

function dialogueIsCurrent(draft: CreateStoryDraft, line: CreateStoryScene["dialogues"][number]) {
  return !line.audioOutdated && isCurrentCustomAudio({
    audioUrl: line.audioUrl,
    storagePath: line.audioStoragePath,
    storedFingerprint: line.audioFingerprint,
    text: line.text,
    voiceConfiguration: customDialogueVoiceConfiguration(line),
    language: draft.language,
  });
}

function narrationIsCurrent(draft: CreateStoryDraft, scene: CreateStoryScene) {
  return !scene.narrationAudioOutdated && isCurrentCustomAudio({
    audioUrl: scene.narrationAudioUrl,
    storagePath: scene.narrationAudioStoragePath,
    storedFingerprint: scene.narrationAudioFingerprint,
    text: narrationText(scene),
    voiceConfiguration: customNarrationVoiceConfiguration(),
    language: draft.language,
  });
}

export function isCurrentCustomDialogueAudio(draft: CreateStoryDraft, line: CreateStoryScene["dialogues"][number]) {
  return dialogueIsCurrent(draft, line);
}

export function isCurrentCustomNarrationAudio(draft: CreateStoryDraft, scene: CreateStoryScene) {
  return narrationIsCurrent(draft, scene);
}

function genderForVoice(value: string) {
  return /female|heroine|woman|girl/i.test(value) ? "female" : "male";
}

/** Preserves Custom Mode's authored voice choice while adapting it to existing TTS providers. */
export function customVoiceProfile(character: CreateStoryCharacter | undefined, narrator = false, voiceStyle?: string): MovieCharacterVoice {
  const description = narrator ? "Custom story narrator" : voiceStyle || character?.voiceStyle || "Custom character voice";
  const gender = narrator ? "female" : genderForVoice(description);
  return {
    archetype: narrator ? "narrator" : gender === "female" ? "hero_female" : "hero_male",
    character: narrator ? "Narrator" : character?.name || "Character",
    deepgramModel: gender === "female" ? "aura-2-thalia-en" : "aura-2-orion-en",
    description,
    gender,
    tone: "natural",
    voiceName: description,
  };
}

export function customSceneMusicDecision(scene: CreateStoryScene): SceneMusicDecision {
  if (scene.backgroundMusicStatus === "silent") return { outcome: "silence", reason: "The author selected intentional silence." };
  return decideSceneMusic({
    mood: scene.sceneTone,
    sceneTitle: scene.title,
    narration: scene.storyDescription || scene.selectedSuggestion,
    dialogueCount: scene.dialogues.filter((line) => line.text.trim()).length,
  });
}

export function customDraftToMovieScenes(draft: CreateStoryDraft): MovieScene[] {
  return draft.scenes.map((scene) => {
    const decision = customSceneMusicDecision(scene);
    const dialogues: MovieDialogueLine[] = scene.dialogues.filter((line) => line.text.trim()).map((line) => ({
      id: line.id,
      character: line.characterName,
      delivery: "neutral",
      line: line.text,
      audioUrl: dialogueIsCurrent(draft, line) ? line.audioUrl : undefined,
      voiceProfile: customVoiceProfile(draft.characters.find((character) => character.id === line.characterId), false, line.voiceStyle),
    }));
    return {
      persistenceSceneId: scene.id,
      directorNotes: "",
      dialogues,
      estimatedDuration: "",
      imagePrompt: scene.generatedImagePrompt || "",
      location: "",
      mood: scene.sceneTone,
      narration: narrationText(scene),
      narrationAudioUrl: narrationIsCurrent(draft, scene) ? scene.narrationAudioUrl : undefined,
      sceneNumber: scene.sceneNumber,
      sceneGenre: scene.sceneGenre,
      sceneTone: scene.sceneTone,
      soundDesign: "",
      title: scene.title,
      visualPrompt: scene.storyDescription || scene.selectedSuggestion,
      generatedImageUrl: scene.generatedImageUrl,
      generatedImagePrompt: scene.generatedImagePrompt,
      generatedImageStatus: scene.generatedImageStatus === "ready" ? "completed" : scene.generatedImageStatus === "error" ? "failed" : scene.generatedImageStatus,
      backgroundMusicUrl: scene.backgroundMusicUrl,
      backgroundMusicCategory: decision.outcome === "music" ? decision.category : undefined,
      backgroundMusicProvider: scene.backgroundMusicProvider,
      backgroundMusicReason: decision.reason,
      backgroundMusicStatus: scene.backgroundMusicStatus === "ready" ? "completed" : scene.backgroundMusicStatus === "error" ? "failed" : decision.outcome === "silence" ? "silent" : scene.backgroundMusicStatus,
    };
  });
}

/** Builds a bounded TTS request containing only missing clips; saved clips are retained. */
export function buildCustomVoiceRequest(draft: CreateStoryDraft): VideoGenerationResponse {
  return {
    id: `custom-${draft.clientImportId}`,
    title: draft.storyTitle,
    genre: draft.genres.join(", "),
    tone: draft.tones.join(", "),
    logline: "Custom authored story",
    estimatedRuntime: "",
    generatedAt: new Date().toISOString(),
    characterVoices: draft.characters.map((character) => customVoiceProfile(character)),
    audio: { errors: [], generatedCount: 0, provider: "", requested: true },
    scenes: draft.scenes.map((scene) => ({
      ...customDraftToMovieScenes(draft).find((item) => item.persistenceSceneId === scene.id)!,
      dialogues: [
        ...(draft.includeNarration && narrationText(scene).trim() && !narrationIsCurrent(draft, scene)
          ? [{ id: `${NARRATION_PREFIX}${scene.id}`, character: "Narrator", delivery: "neutral", line: narrationText(scene), voiceProfile: customVoiceProfile(undefined, true) }]
          : []),
        ...scene.dialogues.filter((line) => line.text.trim() && !dialogueIsCurrent(draft, line)).map((line) => ({ id: line.id, character: line.characterName, delivery: "neutral", line: line.text, voiceProfile: customVoiceProfile(draft.characters.find((character) => character.id === line.characterId), false, line.voiceStyle) })),
      ],
    })),
  };
}

export function applyCustomVoiceResponse(draft: CreateStoryDraft, response: VideoGenerationResponse): CreateStoryDraft {
  // A dialogue ID is stable within a scene, not a globally trusted media key.
  // Scope every response to its stable Custom scene ID before attaching audio.
  const bySceneAndId = indexReturnedTtsClips(response.scenes.flatMap((scene) => scene.dialogues
    .filter((line) => line.audioUrl)
    .map((line) => ({ sceneIdentity: scene.persistenceSceneId ?? scene.sceneNumber, dialogueId: line.id, audioUrl: line.audioUrl!, storagePath: line.audioStoragePath }))));
  return {
    ...draft,
    scenes: draft.scenes.map((scene) => ({
      ...scene,
      ...(bySceneAndId.get(ttsClipKey(scene.id, `${NARRATION_PREFIX}${scene.id}`)) ? {
        narrationAudioUrl: bySceneAndId.get(ttsClipKey(scene.id, `${NARRATION_PREFIX}${scene.id}`))!.audioUrl,
        narrationAudioFingerprint: customAudioFingerprint(narrationText(scene), customNarrationVoiceConfiguration(), draft.language),
        narrationAudioStoragePath: bySceneAndId.get(ttsClipKey(scene.id, `${NARRATION_PREFIX}${scene.id}`))!.storagePath,
        narrationAudioOutdated: false,
      } : {}),
      dialogues: scene.dialogues.map((line) => {
        const clip = bySceneAndId.get(ttsClipKey(scene.id, line.id));
        return clip ? {
          ...line,
          audioUrl: clip.audioUrl,
          audioStoragePath: clip.storagePath,
          audioFingerprint: customAudioFingerprint(line.text, customDialogueVoiceConfiguration(line), draft.language),
          audioOutdated: false,
        } : line;
      }),
    })),
  };
}
