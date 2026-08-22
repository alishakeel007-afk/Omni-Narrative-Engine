import type {
  CreateStoryCharacter,
  CreateStoryDialogue,
  CreateStoryDraft,
  CreateStoryScene
} from "@/types/create-story";

export const CREATE_STORY_STORAGE_KEY = "omni-narrative-engine-create-your-own-story";

const defaultCharacters: CreateStoryCharacter[] = [
  {
    id: "character-arin",
    name: "Arin Vale",
    personalityTone: "Brave, sincere, lightly humorous",
    role: "Hero",
    voiceStyle: "Warm young male voice"
  },
  {
    id: "character-lyra",
    name: "Lyra Voss",
    personalityTone: "Observant, calm, mysterious",
    role: "Strategist",
    voiceStyle: "Soft confident female voice"
  }
];

export function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultDraft(): CreateStoryDraft {
  return {
    audio: {
      backgroundMusicMessage: "Background music has not been generated yet.",
      backgroundMusicStatus: "idle",
      voiceMessage: "Character voices have not been generated yet.",
      voiceStatus: "idle"
    },
    visuals: {
      message: "Scene visuals have not been generated yet.",
      status: "idle"
    },
    characters: defaultCharacters,
    genres: ["Fantasy"],
    includeNarration: true,
    numberOfScenes: 3,
    scenes: [],
    selectedMode: "create-your-own",
    storyTitle: "Untitled Cinematic Story",
    tones: ["Suspenseful"],
    updatedAt: new Date().toISOString(),
    video: {
      message: "Video preview is waiting for backend integration.",
      status: "idle"
    }
  };
}

export function createDialoguesForCharacters(
  characters: CreateStoryCharacter[],
  existingDialogues: CreateStoryDialogue[] = []
) {
  const normalizedExisting = existingDialogues
    .filter((dialogue) => characters.some((character) => character.id === dialogue.characterId))
    .map((dialogue, index) => {
      const character = characters.find((item) => item.id === dialogue.characterId);

      return {
        characterId: dialogue.characterId,
        characterName: character?.name || dialogue.characterName || "Unnamed Character",
        id: dialogue.id || createId(`dialogue-${index + 1}`),
        text: dialogue.text ?? "",
        voiceStyle: dialogue.voiceStyle || character?.voiceStyle || "Voice style placeholder"
      };
    });

  const missingCharacterDialogues = characters
    .filter((character) => !normalizedExisting.some((dialogue) => dialogue.characterId === character.id))
    .map((character) => ({
      characterId: character.id,
      characterName: character.name || "Unnamed Character",
      id: createId("dialogue"),
      text: "",
      voiceStyle: character.voiceStyle || "Voice style placeholder"
    }));

  return [...normalizedExisting, ...missingCharacterDialogues];
}

export function createSceneSuggestions(params: {
  characters: CreateStoryCharacter[];
  genres: string[];
  sceneNumber: number;
  storyTitle: string;
  tones: string[];
}) {
  const lead = params.characters[0]?.name || "the lead character";
  const support = params.characters[1]?.name || "their closest ally";
  const genre = params.genres.join(" and ") || "cinematic";
  const tone = params.tones.join(" and ") || "emotional";
  const title = params.storyTitle || "the story";

  return [
    `${lead} discovers a hidden clue that changes the direction of ${title}, pushing the scene into a ${tone.toLowerCase()} ${genre.toLowerCase()} turn.`,
    `${support} challenges ${lead}'s plan, forcing the characters to reveal what they are afraid to lose before the scene ends.`,
    `A new obstacle appears at the worst moment, making the characters choose between safety, truth, and the next step of the journey.`
  ];
}

export function createEmptyScene(params: {
  characters: CreateStoryCharacter[];
  genres: string[];
  sceneNumber: number;
  storyTitle: string;
  tones: string[];
}): CreateStoryScene {
  return {
    activeCharacterIds: params.characters.map((character) => character.id),
    dialogues: createDialoguesForCharacters(params.characters),
    id: createId("scene"),
    sceneGenre: params.genres[0] || "Cinematic",
    sceneNumber: params.sceneNumber,
    sceneTone: params.tones[0] || "Dramatic",
    selectedSuggestion: "",
    storyDescription: "",
    suggestions: createSceneSuggestions(params),
    title: `Scene ${params.sceneNumber}`
  };
}

export function createMockDialogue(params: {
  characters: CreateStoryCharacter[];
  scene: CreateStoryScene;
  tones: string[];
}) {
  const sceneText =
    params.scene.storyDescription.trim() ||
    params.scene.selectedSuggestion.trim() ||
    "this moment changes the direction of the story";

  return params.characters.map<CreateStoryDialogue>((character, index) => {
    const tone = params.tones[index % Math.max(params.tones.length, 1)] || "cinematic";
    const isVillain = /villain|enemy|shadow|antagonist/i.test(character.role);
    const isComic = /funny|comic|humor|playful/i.test(`${tone} ${character.personalityTone}`);
    const line = isVillain
      ? `You still think this is your story, but ${sceneText.slice(0, 92).toLowerCase()} will prove otherwise.`
      : isComic
        ? `I know this is serious, but if ${sceneText.slice(0, 86).toLowerCase()}, we should at least look confident.`
        : `I can feel the ${tone.toLowerCase()} weight of this moment. ${sceneText.slice(0, 96)}`;

    return {
      characterId: character.id,
      characterName: character.name || `Character ${index + 1}`,
      id: createId("dialogue"),
      text: line,
      voiceStyle: character.voiceStyle || "Voice style placeholder"
    };
  });
}

export function normalizeCreateStoryDraft(value: Partial<CreateStoryDraft> | null | undefined) {
  const fallback = createDefaultDraft();
  const savedGenres = Array.isArray(value?.genres)
    ? value.genres.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
  const savedTones = Array.isArray(value?.tones)
    ? value.tones.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
  const characters =
    Array.isArray(value?.characters) && value.characters.length > 0
      ? value.characters.map((character, index) => ({
          id: character.id || createId(`character-${index + 1}`),
          name: character.name || `Character ${index + 1}`,
          personalityTone: character.personalityTone || "Balanced cinematic tone",
          role: character.role || "Supporting Character",
          voiceStyle: character.voiceStyle || "Voice style placeholder"
        }))
      : fallback.characters;
  const genres =
    savedGenres.length > 0 ? savedGenres : fallback.genres;
  const tones =
    savedTones.length > 0 ? savedTones : fallback.tones;
  const storyTitle = value?.storyTitle?.trim() || fallback.storyTitle;
  const numberOfScenes = Math.max(1, Math.min(10, Number(value?.numberOfScenes) || 3));
  const scenes =
    Array.isArray(value?.scenes) && value.scenes.length > 0
      ? value.scenes.map((scene, index) => {
          const suggestions =
            Array.isArray(scene.suggestions) && scene.suggestions.length === 3
              ? scene.suggestions.filter((item): item is string => typeof item === "string")
              : [];

          return {
            activeCharacterIds:
              Array.isArray(scene.activeCharacterIds) && scene.activeCharacterIds.length > 0
                ? scene.activeCharacterIds.filter((id) => characters.some((character) => character.id === id))
                : characters.map((character) => character.id),
            dialogues: createDialoguesForCharacters(
              characters,
              Array.isArray(scene.dialogues) ? scene.dialogues : []
            ),
            id: scene.id || createId(`scene-${index + 1}`),
            sceneGenre: scene.sceneGenre || genres[0] || "Cinematic",
            sceneNumber: index + 1,
            sceneTone: scene.sceneTone || tones[0] || "Dramatic",
            selectedSuggestion: scene.selectedSuggestion || "",
            storyDescription: scene.storyDescription || "",
            suggestions:
              suggestions.length === 3
                ? suggestions
                : createSceneSuggestions({
                    characters,
                    genres,
                    sceneNumber: index + 1,
                    storyTitle,
                    tones
                  }),
            title: scene.title || `Scene ${index + 1}`,
            generatedImageUrl: scene.generatedImageUrl,
            generatedImagePrompt: scene.generatedImagePrompt,
            generatedImageStatus: scene.generatedImageStatus,
            generatedImageError: scene.generatedImageError
          };
        })
      : [];

  return {
    ...fallback,
    ...value,
    audio: {
      ...fallback.audio,
      ...value?.audio
    },
    visuals: {
      ...fallback.visuals,
      ...value?.visuals
    },
    characters,
    genres,
    numberOfScenes,
    scenes,
    selectedMode: "create-your-own" as const,
    storyTitle,
    tones,
    updatedAt: value?.updatedAt || new Date().toISOString(),
    video: {
      ...fallback.video,
      ...value?.video
    }
  };
}

export function loadCreateStoryDraft() {
  if (typeof window === "undefined") {
    return createDefaultDraft();
  }

  try {
    const rawDraft = window.localStorage.getItem(CREATE_STORY_STORAGE_KEY);

    if (!rawDraft) {
      return createDefaultDraft();
    }

    return normalizeCreateStoryDraft(JSON.parse(rawDraft) as Partial<CreateStoryDraft>);
  } catch {
    window.localStorage.removeItem(CREATE_STORY_STORAGE_KEY);
    return createDefaultDraft();
  }
}

export function saveCreateStoryDraft(draft: CreateStoryDraft) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    CREATE_STORY_STORAGE_KEY,
    JSON.stringify({
      ...draft,
      updatedAt: new Date().toISOString()
    })
  );
}

export function resetCreateStoryDraft() {
  if (typeof window === "undefined") {
    return createDefaultDraft();
  }

  const freshDraft = createDefaultDraft();
  window.localStorage.setItem(CREATE_STORY_STORAGE_KEY, JSON.stringify(freshDraft));
  return freshDraft;
}
