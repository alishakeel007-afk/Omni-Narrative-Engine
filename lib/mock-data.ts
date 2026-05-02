import type { Route } from "next";
import {
  BookOpenText,
  BrainCircuit,
  Compass,
  ImageIcon,
  Mic2,
  Orbit,
  Sparkles
} from "lucide-react";

export const navLinks: { href: Route; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/setup", label: "Story Setup" },
  { href: "/story", label: "Story Experience" },
  { href: "/video", label: "Video Studio" },
  { href: "/dashboard", label: "Dashboard" }
];

export const featureCards = [
  {
    title: "AI Story Generation",
    description: "Responsive scene building, cinematic text, and branching narrative structure.",
    icon: Sparkles
  },
  {
    title: "Custom Story Path",
    description: "Let players write their own direction at every major turning point.",
    icon: Compass
  },
  {
    title: "Guided Choices",
    description: "Offer curated AI options to keep pacing tight without removing freedom.",
    icon: BookOpenText
  },
  {
    title: "Character Consistency",
    description: "Track identity, relationships, mood, and continuity across scenes.",
    icon: Orbit
  },
  {
    title: "Image Generation",
    description: "Prepare slots for scene art, environment cards, and cinematic reveals.",
    icon: ImageIcon
  },
  {
    title: "Audio Narration",
    description: "Support spoken narration, voice mood, and background ambiance.",
    icon: Mic2
  },
  {
    title: "Long-Term Memory",
    description: "Preserve key events, user decisions, and world-state changes.",
    icon: BrainCircuit
  }
];

export const genres = [
  "Fantasy",
  "Mystery",
  "Sci-Fi",
  "Horror",
  "Adventure",
  "Romance",
  "Custom Genre"
];

export const moods = ["Calm", "Dark", "Emotional", "Suspenseful", "Epic", "Funny"];

export const guidedTemplates = [
  "Lost Kingdom",
  "Haunted City",
  "Space Mission",
  "Secret Academy",
  "Custom Template"
];

export const storyModes = [
  {
    id: "guided",
    title: "Guided Story Mode",
    description: "Choose from AI-generated options at every step."
  },
  {
    id: "custom",
    title: "Custom Story Mode",
    description: "Write your own choices and control the story from start to end."
  }
] as const;

export const sampleScenes = [
  {
    sceneNumber: 1,
    chapter: "Chapter One",
    title: "The Whispering Gate",
    text: "The ancient gate trembles as blue light leaks through its broken symbols. Your companion looks at you with fear, waiting for your decision.",
    mood: "Suspenseful",
    location: "Ruins of Vel Astra",
    imageLabel: "Ancient gate wrapped in blue arcane light under midnight fog",
    imagePrompt: "Cinematic ruined gate, cracked runes, blue magical leaks, mist, dark fantasy, ultra-detailed",
    audioPrompt: "Whispers, light wind, distant choir, tension rising",
    options: [
      "Open the gate carefully",
      "Step back and inspect the symbols",
      "Ask your companion what they know"
    ]
  },
  {
    sceneNumber: 2,
    chapter: "Chapter One",
    title: "The Forest of Echoes",
    text: "Beyond the gate, a silver forest stretches across a moonlit valley. Every tree repeats your footsteps in soft echoes, as if the woods are learning your name.",
    mood: "Dark",
    location: "Forest of Echoes",
    imageLabel: "Silver trees, moonlit valley, soft violet fog and glowing roots",
    imagePrompt: "Mystical silver forest, moonlight, glowing roots, atmospheric blue-violet haze",
    audioPrompt: "Layered forest ambience, echoing steps, low mystical hum",
    options: [
      "Follow the glowing roots downhill",
      "Call out to the unseen voice in the trees",
      "Mark the gate path before moving deeper"
    ]
  },
  {
    sceneNumber: 3,
    chapter: "Chapter Two",
    title: "The Archive Beneath Glass",
    text: "A buried observatory opens below the valley floor. Star maps float between broken mirrors, and a dormant machine turns toward you as if it has been waiting for centuries.",
    mood: "Epic",
    location: "Astral Observatory",
    imageLabel: "Underground observatory with floating star maps and broken glass light",
    imagePrompt: "Sci-fantasy underground observatory, floating constellations, fractured mirrors, gold and blue highlights",
    audioPrompt: "Mechanical awakening, resonant chimes, slow orchestral swell",
    options: [
      "Activate the dormant machine",
      "Search the floating maps for your name",
      "Ask the companion to keep watch while you investigate"
    ]
  }
];

export const characterProfile = {
  name: "Lyra Voss",
  role: "Relic Interpreter",
  traits: ["Observant", "Protective", "Brave", "Curious"],
  appearance: "Silver-lined cloak, midnight braid, glowing glyph scar across the wrist.",
  relationships: [
    "Companion Arin distrusts ancient relics but trusts Lyra.",
    "The gate appears to react specifically to Lyra's voice."
  ],
  emotionalState: "Focused but quietly afraid",
  imageLabel: "Character portrait placeholder for Lyra Voss"
};

export const starterMemory = [
  {
    sceneNumber: 1,
    userChoice: "Open the gate carefully",
    result: "The gate responds with a low hum and reveals the moonlit valley beyond.",
    update: "A hidden realm named the Forest of Echoes becomes accessible."
  }
];

export const dashboardStats = [
  { label: "Saved Stories", value: "12" },
  { label: "Favorite Genres", value: "Fantasy, Mystery" },
  { label: "Recent Sessions", value: "4 this week" },
  { label: "Total Scenes Generated", value: "148" },
  { label: "Total Custom Choices Made", value: "57" }
];
