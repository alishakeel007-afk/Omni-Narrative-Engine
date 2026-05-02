import type { DummySceneTemplate } from "@/types/story";

export const DUMMY_SCENE_TEMPLATES: DummySceneTemplate[] = [
  {
    sceneNumber: 1,
    chapter: "Chapter 1: The Awakening",
    title: "The Ancient Gate",
    location: "Forgotten Ruins",
    mood: "mysterious",
    text: "You awaken in a chamber filled with ancient symbols. A massive stone gate stands before you, covered in glowing runes. The air hums with latent magic, and you sense that your decision here will shape the destiny of your journey.",
    optionSeeds: [
      "Touch the glowing runes",
      "Study the chamber walls",
      "Call out to see if anyone responds"
    ],
    media: {
      baseImagePrompt: "Ancient stone chamber with glowing runes on a massive gate, mysterious atmosphere, fantasy setting",
      baseAudioMoodPrompt: "Ethereal ambient music with subtle magical humming and distant echoes",
      backgroundMusicMood: "mysterious",
      narrationDuration: "15s",
      narrationLabel: "Narrator describes the awakening scene",
      playerState: "ready"
    }
  },
  {
    sceneNumber: 2,
    chapter: "Chapter 1: The Awakening",
    title: "The Hidden Passage",
    location: "Underground Caverns",
    mood: "tense",
    text: "Following the gate's activation, you discover a hidden passage leading deeper into the earth. Strange whispers echo from the darkness ahead, and you notice ancient symbols that seem to react to your presence.",
    optionSeeds: [
      "Follow the whispers cautiously",
      "Mark the path with symbols",
      "Search for another way forward"
    ],
    media: {
      baseImagePrompt: "Dark underground cavern with glowing symbols, tense atmosphere, fantasy adventure",
      baseAudioMoodPrompt: "Tense ambient music with whispering sounds and distant dripping water",
      backgroundMusicMood: "tense",
      narrationDuration: "12s",
      narrationLabel: "Narrator describes the cavern discovery",
      playerState: "ready"
    },
    inventoryHint: "Ancient Key"
  },
  {
    sceneNumber: 3,
    chapter: "Chapter 2: The Machine",
    title: "The Ancient Machine",
    location: "Crystal Chamber",
    mood: "awe-inspiring",
    text: "You enter a vast chamber dominated by a crystalline machine that pulses with inner light. The device appears to be some kind of ancient technology, and you can feel its power resonating through the stone floor.",
    optionSeeds: [
      "Attempt to activate the machine",
      "Examine the crystal components",
      "Look for control mechanisms"
    ],
    media: {
      baseImagePrompt: "Massive crystalline machine in a glowing chamber, awe-inspiring technology, fantasy setting",
      baseAudioMoodPrompt: "Majestic ambient music with crystal humming and power surges",
      backgroundMusicMood: "awe-inspiring",
      narrationDuration: "14s",
      narrationLabel: "Narrator describes the machine chamber",
      playerState: "ready"
    }
  },
  {
    sceneNumber: 4,
    chapter: "Chapter 2: The Machine",
    title: "The Guardian's Challenge",
    location: "Crystal Chamber",
    mood: "epic",
    text: "As you interact with the machine, a guardian spirit manifests before you. It speaks of trials and tests, demanding proof of your worthiness to proceed further into the ancient complex.",
    optionSeeds: [
      "Accept the challenge directly",
      "Try to communicate with the spirit",
      "Search for an alternative path"
    ],
    media: {
      baseImagePrompt: "Ethereal guardian spirit in crystal chamber, epic confrontation, fantasy battle",
      baseAudioMoodPrompt: "Epic orchestral music with spirit voices and crystal chimes",
      backgroundMusicMood: "epic",
      narrationDuration: "16s",
      narrationLabel: "Narrator describes the guardian encounter",
      playerState: "ready"
    },
    inventoryHint: "Map Fragment"
  },
  {
    sceneNumber: 5,
    chapter: "Chapter 3: The Revelation",
    title: "The Hidden Library",
    location: "Ancient Library",
    mood: "scholarly",
    text: "Beyond the guardian lies a vast library filled with ancient tomes and artifacts. Knowledge from ages past surrounds you, and you sense that the answers to the machine's purpose lie within these walls.",
    optionSeeds: [
      "Search for information about the machine",
      "Look for maps of the complex",
      "Examine the oldest artifacts"
    ],
    media: {
      baseImagePrompt: "Ancient library with glowing books and artifacts, scholarly atmosphere, fantasy knowledge",
      baseAudioMoodPrompt: "Calm scholarly music with page turning sounds and ancient whispers",
      backgroundMusicMood: "scholarly",
      narrationDuration: "13s",
      narrationLabel: "Narrator describes the library discovery",
      playerState: "ready"
    },
    inventoryHint: "Lantern"
  }
];