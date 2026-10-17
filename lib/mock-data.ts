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
  { href: "/", label: "Home" },
  { href: "/story/mode", label: "Video Studio" },
  { href: "/dashboard", label: "Dashboard" }
];

export const featureCards = [
  {
    title: "AI Story Generation",
    description: "Generate cinematic stories and scenes using AI.",
    icon: Sparkles
  },
  {
    title: "Scene & Dialogue Control",
    description: "Review, edit, reorder, and refine every scene before media generation.",
    icon: BookOpenText
  },
  {
    title: "Character Voices",
    description: "Assign consistent voices and generate narration and character dialogue.",
    icon: Wand2
  },
  {
    title: "Cinematic Visuals",
    description: "Generate scene artwork that reflects your characters, location, and mood.",
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

