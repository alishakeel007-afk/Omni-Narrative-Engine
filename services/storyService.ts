import { DUMMY_SCENE_TEMPLATES } from "@/data/dummyScenes";
import { buildSceneCharacters } from "@/lib/story-engine";
import {
  DEFAULT_HEALTH_STATUS,
  DEFAULT_INVENTORY,
  DEFAULT_STORY_SETUP
} from "@/lib/story-storage";
import type {
  ChoiceType,
  DummySceneTemplate,
  GeneratedMediaMock,
  HealthStatus,
  PersistedStoryState,
  StoryScene,
  StorySetupData
} from "@/types/story";

const RISK_KEYWORDS = ["attack", "run", "rush", "jump", "fight", "activate"];
const CAREFUL_KEYWORDS = ["careful", "inspect", "study", "listen", "hide", "observe"];
const MAGIC_KEYWORDS = ["gate", "symbol", "glow", "whisper", "machine", "relic"];
const TEAM_KEYWORDS = ["companion", "team", "together", "ask", "tell", "protect"];
const INVENTORY_REWARDS = ["Ancient Key", "Map Fragment", "Lantern", "Silver Pendant"];

function clampStat(value: number) {
  return Math.max(0, Math.min(100, value));
}

function titleCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pickReward(choice: string, nextIndex: number) {
  const lowered = choice.toLowerCase();

  if (lowered.includes("map")) return "Map Fragment";
  if (lowered.includes("light") || lowered.includes("lantern")) return "Lantern";
  if (lowered.includes("key") || lowered.includes("unlock")) return "Ancient Key";
  if (lowered.includes("pendant") || lowered.includes("proof")) return "Silver Pendant";
  return INVENTORY_REWARDS[nextIndex % INVENTORY_REWARDS.length];
}

export function buildGeneratedMedia(
  template: DummySceneTemplate,
  setup: StorySetupData,
  decisionHint?: string
): GeneratedMediaMock {
  const suffix = decisionHint ? ` Decision influence: ${decisionHint}.` : "";

  return {
    audioMoodPrompt: `${template.media.baseAudioMoodPrompt}. Mood: ${setup.mood}. Genre: ${setup.genre}.${suffix}`,
    backgroundMusicMood: template.media.backgroundMusicMood,
    imageLabel: `${setup.genre} visual placeholder focused on ${setup.characterName} in ${template.location}`,
    imagePrompt: `${template.media.baseImagePrompt}. Character: ${setup.characterName}. Role: ${setup.characterRole}. Mood: ${template.mood}.${suffix}`,
    narrationDuration: template.media.narrationDuration,
    narrationLabel: template.media.narrationLabel,
    playerState: template.media.playerState
  };
}

function buildOptions(template: DummySceneTemplate, setup: StorySetupData) {
  return template.optionSeeds.map((seed, index) => {
    if (index === 0) return `${seed} as ${setup.characterName}`;
    if (index === 1) return `${seed} using ${setup.genre.toLowerCase()} instincts`;
    return `${seed} while honoring the ${setup.characterRole.toLowerCase()} role`;
  });
}

export function buildSceneFromTemplate(
  template: DummySceneTemplate,
  setup: StorySetupData = DEFAULT_STORY_SETUP,
  decisionPrefix?: string
): StoryScene {
  const cast = buildSceneCharacters(setup)[template.sceneNumber - 1] ?? buildSceneCharacters(setup)[0];
  const castSummary = cast.map((character) => character.name).join(", ");
  const intro = decisionPrefix ? `${decisionPrefix} ` : "";

  return {
    cast,
    chapter: template.chapter,
    location: template.location,
    media: buildGeneratedMedia(template, setup, decisionPrefix),
    mood: template.mood,
    options: buildOptions(template, setup),
    sceneNumber: template.sceneNumber,
    text: `${intro}${template.text} Present in this scene: ${castSummary}.`,
    title: template.sceneNumber === 1 ? `${template.title}: ${setup.storyTitle}` : template.title
  };
}

export function getInitialScene(setup: StorySetupData = DEFAULT_STORY_SETUP) {
  return buildSceneFromTemplate(DUMMY_SCENE_TEMPLATES[0], setup);
}

export function createInitialStoryState(setup: StorySetupData = DEFAULT_STORY_SETUP): PersistedStoryState {
  const initialScene = getInitialScene(setup);

  return {
    currentScene: initialScene,
    currentSceneIndex: 0,
    customChoiceInput: setup.mode === "custom" ? setup.startingIdea : "",
    generatedMedia: initialScene.media,
    healthStatus: DEFAULT_HEALTH_STATUS,
    inventory: DEFAULT_INVENTORY,
    isLoading: false,
    lastSavedAt: null,
    memoryTimeline: [],
    selectedChoice: "",
    selectedChoiceType: null,
    setup
  };
}

function buildDecisionSummary(choice: string, template: DummySceneTemplate) {
  const lowered = choice.toLowerCase();

  if (lowered.includes("gate")) {
    return `The gate reacts to your decision, releasing a pulse that leads toward ${template.location}.`;
  }

  if (lowered.includes("symbol") || lowered.includes("whisper")) {
    return `The old symbols answer your action and reveal a hidden route into ${template.location}.`;
  }

  if (lowered.includes("talk") || lowered.includes("ask")) {
    return `The conversation uncovers a clue that points the team toward ${template.location}.`;
  }

  if (lowered.includes("map") || lowered.includes("search")) {
    return `Your search reveals a traceable clue, shifting the story toward ${template.location}.`;
  }

  if (lowered.includes("machine") || lowered.includes("activate")) {
    return `The machine stirs and reframes the scene, unlocking access to ${template.location}.`;
  }

  return `${titleCase(choice)} changes the tension of the scene and pushes the story toward ${template.location}.`;
}

function applyStatusDelta(status: HealthStatus, choice: string) {
  const lowered = choice.toLowerCase();
  const nextStatus = { ...status };

  if (RISK_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
    nextStatus.health = clampStat(nextStatus.health - 6);
    nextStatus.resolve = clampStat(nextStatus.resolve + 4);
  }

  if (CAREFUL_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
    nextStatus.health = clampStat(nextStatus.health + 2);
    nextStatus.resolve = clampStat(nextStatus.resolve + 3);
  }

  if (MAGIC_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
    nextStatus.mana = clampStat(nextStatus.mana - 4);
  }

  if (TEAM_KEYWORDS.some((keyword) => lowered.includes(keyword))) {
    nextStatus.resolve = clampStat(nextStatus.resolve + 2);
  }

  return nextStatus;
}

function applyInventoryUpdate(inventory: string[], choice: string, nextIndex: number) {
  const reward = pickReward(choice, nextIndex);
  return inventory.includes(reward) ? inventory : [...inventory, reward];
}

export function generateMoreOptions(scene: StoryScene, setup: StorySetupData) {
  return scene.options.map((option, index) => {
    if (index === 0) return `Probe a hidden route near ${scene.location}`;
    if (index === 1) return `${option} with a quieter ${setup.mood.toLowerCase()} approach`;
    return `${option} while coordinating with the full scene cast`;
  });
}

export function generateNextScene(params: {
  choice: string;
  choiceType: ChoiceType;
  currentSceneIndex: number;
  healthStatus: HealthStatus;
  inventory: string[];
  setup: StorySetupData;
}) {
  const nextIndex = (params.currentSceneIndex + 1) % DUMMY_SCENE_TEMPLATES.length;
  const nextTemplate = DUMMY_SCENE_TEMPLATES[nextIndex];
  const resultSummary = buildDecisionSummary(params.choice, nextTemplate);
  const nextScene = buildSceneFromTemplate(nextTemplate, params.setup, resultSummary);
  const nextHealthStatus = applyStatusDelta(params.healthStatus, params.choice);
  const nextInventory = applyInventoryUpdate(params.inventory, params.choice, nextIndex);
  const addedItem = nextInventory[nextInventory.length - 1];

  return {
    addedItem,
    currentScene: nextScene,
    currentSceneIndex: nextIndex,
    generatedMedia: nextScene.media,
    healthStatus: nextHealthStatus,
    inventory: nextInventory,
    resultSummary,
    updateSummary: `Choice type: ${params.choiceType}. Mood shifts to ${nextScene.mood}, location updates to ${nextScene.location}, and inventory now includes ${addedItem}.`
  };
}
