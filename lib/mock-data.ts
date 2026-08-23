import type { Route } from "next";
import {
  BookOpenText,
  BrainCircuit,
  Compass,
  Film,
  Mic2,
  Orbit,
  Sparkles,
  Wand2
} from "lucide-react";

export const navLinks: { href: Route; label: string }[] = [
  { href: "/story/mode", label: "Start" },
  { href: "/setup", label: "Setup" },
  { href: "/story/play", label: "Play Story" },
  { href: "/story/memory", label: "Story Memory Board" },
  { href: "/video", label: "AI Story Studio" },
  { href: "/dashboard", label: "Dashboard" }
];

export const featureCards = [
  {
    title: "AI Story Generation",
    description: "Generate cinematic stories and scenes using AI.",
    icon: Sparkles
  },
  {
    title: "AI Guided Story Mode",
    description: "Follow AI-suggested choices step by step.",
    icon: BookOpenText
  },
  {
    title: "AI Story Studio",
    description: "Build full stories with scenes, dialogues, voice, music, and video preview.",
    icon: Wand2
  },
  {
    title: "Custom Story Path",
    description: "Write your own actions and control story direction.",
    icon: Compass
  },
  {
    title: "Character Consistency",
    description: "Keep character roles, traits, and identities consistent.",
    icon: Orbit
  },
  {
    title: "Audio Narration",
    description: "Generate character voices and narration for scenes.",
    icon: Mic2
  },
  {
    title: "Long-Term Memory",
    description: "Store story events, locations, and decisions for continuity.",
    icon: BrainCircuit
  },
  {
    title: "Video Preview",
    description: "Preview final video-ready story scenes before export.",
    icon: Film
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
    title: "AI Story Studio",
    description: "Write your own story direction without AI choice suggestions."
  }
] as const;

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

