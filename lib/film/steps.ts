import type { FilmStep } from "@/types/studio";

export type FilmStepMeta = {
  id: FilmStep;
  title: string;
  description: string;
};

/** The single source of truth for step order, labels and resume targets. */
export const FILM_STEPS: FilmStepMeta[] = [
  {
    id: "setup",
    title: "Setup",
    description:
      "Start from an idea or paste a script, then choose your language, visual style and how much help you want.",
  },
  {
    id: "script",
    title: "Script & Characters",
    description:
      "Review scenes, characters and dialogue. Scene descriptions guide the visuals and are never spoken.",
  },
  {
    id: "generate",
    title: "Generate Video",
    description:
      "Create one video per scene, review and choose its take, then assemble your finished clips.",
  },
  {
    id: "edit",
    title: "Edit & Export",
    description:
      "Trim, split and reorder clips, adjust the audio, then export a merged MP4.",
  },
];

export function stepIndex(step: FilmStep) {
  const index = FILM_STEPS.findIndex((item) => item.id === step);
  return index === -1 ? 0 : index;
}

export function isFilmStep(value: unknown): value is FilmStep {
  return FILM_STEPS.some((step) => step.id === value);
}
