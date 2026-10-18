// @ts-nocheck -- executed directly by Node's TypeScript runner; application
// sources remain typechecked by the project compilation below.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Focused Node tests load TypeScript sources directly.
import {
  customAudioFingerprint,
  customDialogueVoiceConfiguration,
  customNarrationVoiceConfiguration,
  isCurrentCustomAudio,
} from "../lib/custom-story-audio-freshness.ts";
// @ts-ignore Direct Node test import.
import { indexReturnedTtsClips, ttsClipKey } from "../lib/audio/tts-clip-association.ts";
// @ts-expect-error Focused Node tests load TypeScript sources directly.
import { normalizeCreateStoryDraft } from "../lib/create-story-storage.ts";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const english = "en" as const;
const arin = { characterId: "arin", characterName: "Arin Vale", voiceStyle: "Warm young male voice" };
const lyra = { characterId: "lyra", characterName: "Lyra Voss", voiceStyle: "Soft confident female voice" };
const arinText = "What is this place? That crystal is floating above the altar.";
const lyraText = "Keep your voice down. The walls are listening.";
const narration = "Arin and Lyra enter the forgotten shrine beneath the mountain.";

const arinFingerprint = customAudioFingerprint(arinText, customDialogueVoiceConfiguration(arin), english);
const lyraFingerprint = customAudioFingerprint(lyraText, customDialogueVoiceConfiguration(lyra), english);
const narrationFingerprint = customAudioFingerprint(narration, customNarrationVoiceConfiguration(), english);
assert.notEqual(arinFingerprint, lyraFingerprint, "two characters in one scene cannot share a text/voice identity");
assert.notEqual(arinFingerprint, narrationFingerprint, "narration and dialogue have separate identities");
assert.ok(isCurrentCustomAudio({ audioUrl: "https://media.test/arin.mp3", storagePath: "audio/tts/project/arin.mp3", storedFingerprint: arinFingerprint, text: arinText, voiceConfiguration: customDialogueVoiceConfiguration(arin), language: english }));
assert.ok(!isCurrentCustomAudio({ audioUrl: "https://media.test/arin.mp3", storagePath: "audio/tts/project/arin.mp3", storedFingerprint: arinFingerprint, text: "Changed dialogue.", voiceConfiguration: customDialogueVoiceConfiguration(arin), language: english }), "editing one line invalidates only that line's audio");
assert.ok(!isCurrentCustomAudio({ audioUrl: "https://media.test/narration.mp3", storagePath: "audio/tts/project/narration.mp3", storedFingerprint: narrationFingerprint, text: arinText, voiceConfiguration: customDialogueVoiceConfiguration(arin), language: english }), "a narration URL cannot be accepted for a dialogue card");

const restored = normalizeCreateStoryDraft({
  storyTitle: "Restore", clientImportId: "custom-import-restore", language: "en", genres: ["Fantasy"], tones: ["Mystery"], includeNarration: true, numberOfScenes: 1, selectedMode: "create-your-own",
  characters: [{ id: "arin", name: "Arin Vale", role: "Hero", personalityTone: "Brave", voiceStyle: arin.voiceStyle }],
  scenes: [{ id: "scene-stable", sceneNumber: 1, title: "Shrine", storyDescription: narration, selectedSuggestion: "", suggestions: [], sceneGenre: "Fantasy", sceneTone: "Mysterious", activeCharacterIds: ["arin"], narrationAudioUrl: "https://media.test/narration.mp3", narrationAudioFingerprint: narrationFingerprint, narrationAudioStoragePath: "audio/tts/project/narration.mp3", dialogues: [{ id: "line-stable", ...arin, text: arinText, audioUrl: "https://media.test/arin.mp3", audioFingerprint: arinFingerprint, audioStoragePath: "audio/tts/project/arin.mp3" }] }],
  audio: { backgroundMusicStatus: "idle", backgroundMusicMessage: "", voiceStatus: "ready", voiceMessage: "" }, visuals: { status: "idle", message: "" }, video: { status: "idle", message: "" }, updatedAt: new Date().toISOString(),
});
assert.equal(restored.scenes[0]?.dialogues[0]?.audioUrl, "https://media.test/arin.mp3", "save/resume retains the dialogue URL with its identity metadata");
assert.equal(restored.scenes[0]?.dialogues[0]?.audioFingerprint, arinFingerprint);

// Provider integration fixture: each mock byte marker represents a distinct
// synthesized clip. The association used by Custom Mode must deliver the
// corresponding marker to the correct scene/card, never merely the next URL.
const mockProviderClips = indexReturnedTtsClips([
  { sceneIdentity: "scene-one", dialogueId: "custom-narration:scene-one", audioUrl: "data:audio/mock;base64,TkFSUkFUSU9O", storagePath: "audio/tts/project/narration-fixture.mp3" },
  { sceneIdentity: "scene-one", dialogueId: "arin-line", audioUrl: "data:audio/mock;base64,QVJJTg==", storagePath: "audio/tts/project/arin-fixture.mp3" },
  { sceneIdentity: "scene-one", dialogueId: "lyra-line", audioUrl: "data:audio/mock;base64,TFlSQQ==", storagePath: "audio/tts/project/lyra-fixture.mp3" },
]);
assert.match(mockProviderClips.get(ttsClipKey("scene-one", "custom-narration:scene-one"))!.audioUrl, /TkFSUkFUSU9O/, "narration receives only narration fixture bytes");
assert.match(mockProviderClips.get(ttsClipKey("scene-one", "arin-line"))!.audioUrl, /QVJJTg==/, "Arin player receives Arin fixture bytes");
assert.match(mockProviderClips.get(ttsClipKey("scene-one", "lyra-line"))!.audioUrl, /TFlSQQ==/, "Lyra player receives Lyra fixture bytes");
assert.notEqual(mockProviderClips.get(ttsClipKey("scene-one", "arin-line"))!.storagePath, mockProviderClips.get(ttsClipKey("scene-one", "lyra-line"))!.storagePath, "separate clips retain separate storage identities");

const multimedia = read("lib/custom-story-multimedia.ts");
const builder = read("screens/StoryBuilderScreen.tsx");
const audioScreen = read("screens/AudioGenerationScreen.tsx");
const ttsRoute = read("app/api/video/tts/route.ts");
const ttsStorage = read("lib/audio/tts-storage.ts");
assert.match(multimedia, /scene\.persistenceSceneId[\s\S]*line\.id/, "response attachment must be scoped by stable scene and dialogue IDs");
assert.match(multimedia, /custom-narration:/, "narration uses a distinct stable ID namespace");
assert.match(multimedia, /!dialogueIsCurrent/, "old or unproven dialogue audio must regenerate rather than appear ready");
assert.match(builder, /audioOutdated: true/, "editing text or voice marks only the affected dialogue stale");
assert.match(builder, /narrationAudioOutdated: true/, "editing narration marks only narration stale");
assert.match(audioScreen, /isCurrentCustomDialogueAudio/, "individual playback hides stale dialogue URLs");
assert.match(ttsRoute, /text: formatDeepgramEmotionInformedText\(params\.line\.line/, "English TTS receives the dialogue line, not visual context");
assert.match(ttsRoute, /text: params\.line\.line/, "Urdu TTS receives the dialogue line, not visual context");
assert.match(ttsStorage, /crypto\.randomUUID\(\)/, "persistent TTS paths must be collision resistant");
assert.match(ttsRoute, /Custom\/Guided TTS clip diagnostic/, "development-only server diagnostics must trace each clip identity");

console.log("Step 135 Custom narration/dialogue audio separation regressions passed.");
