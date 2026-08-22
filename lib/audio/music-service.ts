import { buildMusicPrompt, buildPromptHash, parseDurationSeconds } from "./music-prompt";
import { resolveProvider } from "./music-provider";
import { uploadMusicToStorage } from "./music-storage";
import { MusicGenerationRequest } from "./types";

export async function generateSceneMusic(params: {
  sceneId: string;
  mood: string;
  soundDesign: string;
  sceneTitle: string;
  sceneLocation?: string;
  narration?: string;
  estimatedDuration?: string;
  genres?: string[];
  existingHash?: string;
  projectId?: string;
}): Promise<{ url: string; prompt: string; hash: string; provider: string }> {
  const durationSeconds = parseDurationSeconds(params.estimatedDuration, 30);
  
  const request: MusicGenerationRequest = {
    sceneId: params.sceneId,
    mood: params.mood,
    soundDesign: params.soundDesign,
    sceneTitle: params.sceneTitle,
    sceneLocation: params.sceneLocation,
    narration: params.narration,
    durationSeconds,
    genres: params.genres,
  };

  const hash = buildPromptHash(request);
  if (params.existingHash && params.existingHash === hash) {
    throw new Error('DUPLICATE');
  }

  const prompt = buildMusicPrompt(request);
  const provider = resolveProvider();

  // Pass the full request with the built prompt replacing the mood field,
  // since the provider uses request.mood as the prompt text.
  const generated = await provider.generateMusic({
    ...request,
    mood: prompt,
  });
  
  const url = await uploadMusicToStorage({
    audioBuffer: generated.audioBuffer,
    contentType: generated.contentType,
    projectId: params.projectId,
    sceneId: params.sceneId,
  });

  return {
    url,
    prompt,
    hash,
    provider: generated.provider,
  };
}
