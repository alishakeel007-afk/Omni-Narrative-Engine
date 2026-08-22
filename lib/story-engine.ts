import { characterProfile, sampleScenes } from "@/lib/mock-data";
import {
  DEFAULT_STORY_SETUP,
  type PersistedStoryState,
  type StorySetupData
} from "@/lib/story-storage";
import type { StoryCharacter } from "@/types/story";

const genreDescriptors: Record<string, { atmosphere: string; motif: string; location: string }> = {
  Fantasy: {
    atmosphere: "arcane moonlight and ancient symbols",
    motif: "forgotten magic",
    location: "Vel Astra"
  },
  Mystery: {
    atmosphere: "silent corridors and hidden clues",
    motif: "buried secrets",
    location: "Noctis Ward"
  },
  "Sci-Fi": {
    atmosphere: "cold starlight and machine whispers",
    motif: "forbidden technology",
    location: "Axiom Station"
  },
  Horror: {
    atmosphere: "uneasy silence and living shadows",
    motif: "dread",
    location: "Black Hollow"
  },
  Adventure: {
    atmosphere: "restless horizons and dangerous ruins",
    motif: "discovery",
    location: "Skyreach Frontier"
  },
  Romance: {
    atmosphere: "soft candlelight and charged glances",
    motif: "longing",
    location: "Lunara Court"
  },
  "Custom Genre": {
    atmosphere: "shifting worlds and unpredictable tone",
    motif: "experimentation",
    location: "The Unwritten Realm"
  }
};

const moodEmotionMap: Record<string, string> = {
  Calm: "Centered and deliberate",
  Dark: "Guarded and emotionally tense",
  Emotional: "Open-hearted and vulnerable",
  Suspenseful: "Focused and alert",
  Epic: "Bold and ready for destiny",
  Funny: "Playful despite the danger"
};

const traitMap: Record<StorySetupData["mode"], string[]> = {
  guided: ["Strategic", "Adaptive", "Curious", "Decisive"],
  custom: ["Inventive", "Independent", "Bold", "Unpredictable"]
};

const companionArchetypes = [
  {
    appearance: "Weathered scout leathers with a lantern strapped across the shoulder.",
    name: "Arin Vale",
    role: "Field Scout",
    traits: ["Wary", "Loyal", "Sharp-Eyed"]
  },
  {
    appearance: "Velvet scholar robes threaded with silver glyph-lines.",
    name: "Seris Quill",
    role: "Archive Scholar",
    traits: ["Analytical", "Calm", "Secretive"]
  },
  {
    appearance: "Polished plated shell lit by a dim inner star-core.",
    name: "Unit Khepri-7",
    role: "Sentinel Construct",
    traits: ["Precise", "Watchful", "Protective"]
  }
] as const;

const sceneNpcByGenre: Record<
  string,
  { appearance: string; name: string; role: string; traits: string[] }
> = {
  Adventure: {
    appearance: "Trail-worn explorer gear with dust and brass compasswork.",
    name: "Captain Mira Thorn",
    role: "Expedition Leader",
    traits: ["Fearless", "Resourceful", "Driven"]
  },
  Fantasy: {
    appearance: "Ceremonial armor etched with moon-script and old sigils.",
    name: "Warden Elyndor",
    role: "Gate Warden",
    traits: ["Ancient", "Severe", "Protective"]
  },
  Horror: {
    appearance: "A shadow-soaked coat with a face half-hidden by stitched veil.",
    name: "Morrow Ash",
    role: "Survivor of the Hollow",
    traits: ["Paranoid", "Scarred", "Insightful"]
  },
  Mystery: {
    appearance: "Dark tailored coat, gloves, and a notebook full of coded marks.",
    name: "Inspector Vale",
    role: "Cryptic Investigator",
    traits: ["Patient", "Observant", "Unsettling"]
  },
  Romance: {
    appearance: "Elegant formal attire with softened gold embroidery and perfume haze.",
    name: "Cassian Dune",
    role: "Confidant",
    traits: ["Charming", "Attentive", "Complicated"]
  },
  "Sci-Fi": {
    appearance: "Adaptive pilot suit with holographic diagnostics flickering at the collar.",
    name: "Dr. Sol Ren",
    role: "Systems Navigator",
    traits: ["Brilliant", "Restless", "Protective"]
  },
  "Custom Genre": {
    appearance: "Shape-shifting attire that seems to rewrite itself in the light.",
    name: "The Unwritten Guide",
    role: "Narrative Interloper",
    traits: ["Elusive", "Transformative", "Playful"]
  }
};

export function buildSceneDeck(storySetup: StorySetupData = DEFAULT_STORY_SETUP) {
  const genreMeta =
    genreDescriptors[storySetup.genre] ?? genreDescriptors[DEFAULT_STORY_SETUP.genre];
  const ideaSnippet =
    storySetup.mode === "custom" && storySetup.startingIdea
      ? storySetup.startingIdea
      : `The ${storySetup.selectedTemplate} template has unlocked a new narrative branch.`;
  const sceneCharacters = buildSceneCharacters(storySetup);

  return sampleScenes.map((scene, index) => {
    const personalizedLocation =
      index === 0 ? `Ruins of ${genreMeta.location}` : `${scene.location} - ${genreMeta.location}`;
    const castSummary = sceneCharacters[index]
      .map((character) => `${character.name} (${character.role})`)
      .join(", ");

    return {
      ...scene,
      audioPrompt: `${scene.audioPrompt}; emotional tone ${storySetup.mood}; genre texture ${storySetup.genre}`,
      imageLabel: `${storySetup.genre} scene art placeholder featuring ${storySetup.characterName}, ${genreMeta.atmosphere}, and ${storySetup.mood.toLowerCase()} energy.`,
      imagePrompt: `${scene.imagePrompt}; genre ${storySetup.genre}; mood ${storySetup.mood}; protagonist ${storySetup.characterName}; motif ${genreMeta.motif}`,
      location: personalizedLocation,
      options: scene.options.map((option, optionIndex) => {
        if (optionIndex === 0) return `${option} as ${storySetup.characterName}`;
        if (optionIndex === 1) return `${option} using ${genreMeta.motif}`;
        return `${option} while honoring the ${storySetup.characterRole.toLowerCase()} role`;
      }),
      text:
        index === 0
          ? `${scene.text} ${storySetup.characterName}, the ${storySetup.characterRole.toLowerCase()}, feels ${storySetup.mood.toLowerCase()} resolve rising. Present in the scene: ${castSummary}. Opening hook: ${ideaSnippet}`
          : `${scene.text} The world reacts to ${storySetup.characterName}'s path through ${genreMeta.atmosphere}, pushing the ${storySetup.genre.toLowerCase()} narrative toward ${genreMeta.motif}. Current scene cast: ${castSummary}.`,
      title:
        index === 0
          ? `${scene.title}: ${storySetup.storyTitle}`
          : `${scene.title} of ${storySetup.characterName}`
    };
  });
}

export function buildPrimaryCharacterProfile(
  storySetup: StorySetupData = DEFAULT_STORY_SETUP
): StoryCharacter {
  const genreMeta =
    genreDescriptors[storySetup.genre] ?? genreDescriptors[DEFAULT_STORY_SETUP.genre];

  return {
    emotionalState: moodEmotionMap[storySetup.mood] ?? characterProfile.emotionalState,
    imageLabel: `${storySetup.characterName} portrait placeholder in a ${storySetup.genre.toLowerCase()} cinematic style`,
    name: storySetup.characterName,
    relationships: [
      `The companion measures every decision against ${storySetup.characterName}'s ${storySetup.mood.toLowerCase()} instincts.`,
      `The narrative frame is ${storySetup.mode === "custom" ? "player-authored" : `guided by the ${storySetup.selectedTemplate} template`}.`
    ],
    role: storySetup.characterRole,
    traits: [...traitMap[storySetup.mode], ...characterProfile.traits].slice(0, 5),
    visualAppearance: `${storySetup.characterName} wears a ${storySetup.genre.toLowerCase()} silhouette shaped by ${genreMeta.atmosphere}, while still presenting as a ${storySetup.characterRole.toLowerCase()}.`
  };
}

export function buildSceneCharacters(
  storySetup: StorySetupData = DEFAULT_STORY_SETUP
): StoryCharacter[][] {
  const genreMeta =
    genreDescriptors[storySetup.genre] ?? genreDescriptors[DEFAULT_STORY_SETUP.genre];
  const genreNpc = sceneNpcByGenre[storySetup.genre] ?? sceneNpcByGenre[DEFAULT_STORY_SETUP.genre];

  return sampleScenes.map((scene, index) => {
    const rotatingCompanion = companionArchetypes[index % companionArchetypes.length];
    const sceneNpc =
      index === 0
        ? genreNpc
        : companionArchetypes[(index + 1) % companionArchetypes.length];

    return [
      {
        emotionalState: moodEmotionMap[storySetup.mood] ?? characterProfile.emotionalState,
        imageLabel: `${storySetup.characterName} close-up portrait placeholder`,
        name: storySetup.characterName,
        relationships: [
          `${storySetup.characterName} anchors the scene as the primary playable character.`,
          `${rotatingCompanion.name} is watching ${storySetup.characterName}'s next move closely.`
        ],
        role: storySetup.characterRole,
        traits: [...traitMap[storySetup.mode], ...characterProfile.traits].slice(0, 4),
        visualAppearance: `${storySetup.characterName} is framed by ${genreMeta.atmosphere} and a ${storySetup.genre.toLowerCase()} silhouette.`
      },
      {
        emotionalState: index === 0 ? "Uneasy but committed" : "Alert and reactive",
        imageLabel: `${rotatingCompanion.name} portrait placeholder`,
        name: rotatingCompanion.name,
        relationships: [
          `${rotatingCompanion.name} has become a recurring ally to ${storySetup.characterName}.`,
          `${rotatingCompanion.name} distrusts ${genreMeta.motif} but remains in the scene.`
        ],
        role: rotatingCompanion.role,
        traits: [...rotatingCompanion.traits],
        visualAppearance: rotatingCompanion.appearance
      },
      {
        emotionalState: index === 0 ? "Guarded and assessing" : "Deeply invested in the outcome",
        imageLabel: `${sceneNpc.name} portrait placeholder`,
        name: sceneNpc.name,
        relationships: [
          `${sceneNpc.name} represents the scene's immediate external pressure.`,
          `${sceneNpc.name} changes the social dynamics of ${scene.title}.`
        ],
        role: sceneNpc.role,
        traits: [...sceneNpc.traits],
        visualAppearance: sceneNpc.appearance
      }
    ];
  });
}

export function buildStarterMemory(storySetup: StorySetupData = DEFAULT_STORY_SETUP) {
  return [
    {
      sceneNumber: 1,
      userChoice:
        storySetup.mode === "custom"
          ? storySetup.startingIdea
          : `Accepted the ${storySetup.selectedTemplate} template premise`,
      result: `${storySetup.storyTitle} begins with ${storySetup.characterName} stepping into a ${storySetup.genre.toLowerCase()} scenario shaped by ${storySetup.mood.toLowerCase()} tension.`,
      update: `Story memory now tracks ${storySetup.characterName}, the ${storySetup.characterRole.toLowerCase()}, and the narrative mood baseline of ${storySetup.mood}.`
    }
  ];
}

export function countCustomChoices(
  progress: PersistedStoryState | null
) {
  if (!progress) return 0;

  return progress.memoryTimeline.filter((item) => item.choiceType === "Custom").length;
}
