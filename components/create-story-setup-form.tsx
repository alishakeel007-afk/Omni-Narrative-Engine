"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import { genres as genreOptions, moods as toneOptions } from "@/lib/mock-data";
import {
  createEmptyScene,
  createId,
  normalizeCreateStoryDraft,
  saveCreateStoryDraft
} from "@/lib/create-story-storage";
import { useStory } from "@/context/StoryContext";
import type { StorySetupCharacter } from "@/types/story";
import { logActivity } from "@/lib/log-activity";

const MAX_SCENES = 10;

const roleOptions = [
  "Hero", "Heroine", "Villain", "Antagonist", "Mentor", "Guide",
  "Detective", "Rogue", "Inventor", "Scholar", "Guardian", "Warrior",
  "Mage", "Healer", "Companion", "Sidekick", "Friend", "Love Interest",
  "Narrator", "Trickster", "Oracle", "Rebel", "Survivor", "Captain",
  "Commander", "Elder", "Child", "Creature", "Robot / AI"
];

const voiceStyleOptions = [
  "Confident hero (male)",
  "Bold heroine (female)",
  "Deep commanding villain (male)",
  "Cold calculating villain (female)",
  "Wise elder mentor (male)",
  "Warm nurturing mentor (female)",
  "Bright young male voice",
  "Warm young female voice",
  "Calm elder male voice",
  "Mature elder female voice",
  "Narrator voice (male)",
  "Narrator voice (female)",
  "Creature / robot voice"
];

const personalityOptions = [
  "Brave", "Cowardly", "Sarcastic", "Sincere", "Mysterious", "Cheerful",
  "Melancholic", "Ruthless", "Compassionate", "Arrogant", "Humble", "Cunning",
  "Naive", "Wise", "Reckless", "Cautious", "Loyal", "Treacherous",
  "Optimistic", "Pessimistic", "Protective", "Selfish", "Playful", "Serious",
  "Broken", "Determined", "Fearless", "Paranoid", "Charming", "Cold"
];

export function CreateStorySetupForm() {
  const router = useRouter();
  const { saveSetupOnly, setup, updateSetup } = useStory();
  const [personalityInputs, setPersonalityInputs] = useState<Record<number, string>>({});

  const missingRequiredFields = [
    !setup.storyTitle.trim() ? "story title" : null,
    setup.genres.length === 0 ? "at least one genre" : null,
    setup.moods.length === 0 ? "at least one tone" : null,
    !setup.numberOfScenes ? "number of scenes" : null,
    setup.characters.every((character) => !character.name.trim()) ? "at least one character" : null,
    setup.characters.some((character) => character.name.trim() && !character.role.trim())
      ? "role for every named character"
      : null
  ].filter(Boolean) as string[];
  const canStart = missingRequiredFields.length === 0;

  const toggleGenre = (genre: string) => {
    const nextGenres = setup.genres.includes(genre)
      ? setup.genres.length === 1
        ? setup.genres
        : setup.genres.filter((item) => item !== genre)
      : [...setup.genres, genre];
    updateSetup({ genre: nextGenres[0], genres: nextGenres });
  };

  const toggleTone = (tone: string) => {
    const nextTones = setup.moods.includes(tone)
      ? setup.moods.length === 1
        ? setup.moods
        : setup.moods.filter((item) => item !== tone)
      : [...setup.moods, tone];
    updateSetup({ mood: nextTones[0], moods: nextTones });
  };

  const updateCharacter = (
    index: number,
    field: keyof Pick<StorySetupCharacter, "name" | "personalityTone" | "role" | "voiceStyle">,
    value: string
  ) => {
    const nextCharacters = setup.characters.map((character, characterIndex) =>
      characterIndex === index ? { ...character, [field]: value } : character
    );
    const primaryCharacter = nextCharacters[0];
    updateSetup({
      characterName: primaryCharacter.name,
      characterRole: primaryCharacter.role,
      characterTraits: primaryCharacter.personalityTone
        ? primaryCharacter.personalityTone.split(",").map((item) => item.trim()).filter(Boolean)
        : primaryCharacter.traits,
      characters: nextCharacters
    });
  };

  const togglePersonalityChip = (index: number, chip: string) => {
    const current = setup.characters[index];
    const currentTraits = current.personalityTone
      ? current.personalityTone.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
    const nextTraits = currentTraits.includes(chip)
      ? currentTraits.filter((t) => t !== chip)
      : [...currentTraits, chip];
    updateCharacter(index, "personalityTone", nextTraits.join(", "));
  };

  const addPersonalityCustom = (index: number) => {
    const custom = (personalityInputs[index] || "").trim();
    if (!custom) return;
    const current = setup.characters[index];
    const currentTraits = current.personalityTone
      ? current.personalityTone.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
    if (!currentTraits.includes(custom)) {
      updateCharacter(index, "personalityTone", [...currentTraits, custom].join(", "));
    }
    setPersonalityInputs((prev) => ({ ...prev, [index]: "" }));
  };

  const addCharacter = () => {
    updateSetup({
      characters: [
        ...setup.characters,
        {
          name: "",
          personalityTone: "",
          role: "",
          traits: [],
          voiceStyle: ""
        }
      ]
    });
  };

  const removeCharacter = (index: number) => {
    if (setup.characters.length === 1) return;
    const nextCharacters = setup.characters.filter((_, characterIndex) => characterIndex !== index);
    const primaryCharacter = nextCharacters[0];
    updateSetup({
      characterName: primaryCharacter.name,
      characterRole: primaryCharacter.role,
      characterTraits: primaryCharacter.traits,
      characters: nextCharacters
    });
  };

  const handleStartBuilding = async () => {
    if (!canStart) return;
    const characters = setup.characters
      .filter((character) => character.name.trim())
      .map((character, index) => ({
        id: createId(`character-${index + 1}`),
        name: character.name.trim(),
        personalityTone: character.personalityTone || character.traits.join(", ") || "Balanced cinematic tone",
        role: character.role.trim() || "Supporting Character",
        voiceStyle: character.voiceStyle || "Narrator voice (male)"
      }));
    const draft = normalizeCreateStoryDraft({
      characters,
      genres: setup.genres,
      numberOfScenes: setup.numberOfScenes,
      scenes: [],
      storyTitle: setup.storyTitle,
      tones: setup.moods
    });
    const firstScene = createEmptyScene({
      characters: draft.characters,
      genres: draft.genres,
      sceneNumber: 1,
      storyTitle: draft.storyTitle,
      tones: draft.tones
    });
    const nextDraft = { ...draft, scenes: [firstScene] };
    saveCreateStoryDraft(nextDraft);
    saveSetupOnly({
      characters: setup.characters,
      genre: setup.genres[0],
      genres: setup.genres,
      mode: "custom",
      mood: setup.moods[0],
      moods: setup.moods,
      numberOfScenes: setup.numberOfScenes,
      storyTitle: setup.storyTitle
    });

    await logActivity("story_started", {
      storyTitle: setup.storyTitle,
      genres: setup.genres,
      tones: setup.moods,
      characterCount: characters.length,
      numberOfScenes: setup.numberOfScenes
    });

    router.push("/story-builder");
  };

  return (
    <form className="space-y-6">
      <WorkflowPanel number="1" subtitle="AI Story Studio" title="Story Foundation">
        <div className="grid gap-5 lg:grid-cols-[1fr_0.45fr]">
          <Field label="Story title">
            <input
              value={setup.storyTitle}
              onChange={(event) => updateSetup({ storyTitle: event.target.value })}
              placeholder="Give your film a working title"
              className="input"
            />
          </Field>
          <Field label={`Number of scenes (max ${MAX_SCENES})`}>
            <input
              min={1}
              max={MAX_SCENES}
              type="number"
              value={setup.numberOfScenes}
              onChange={(event) =>
                updateSetup({
                  numberOfScenes: Math.max(1, Math.min(MAX_SCENES, Number(event.target.value) || 1))
                })
              }
              className="input"
            />
          </Field>
        </div>
      </WorkflowPanel>

      <WorkflowPanel number="2" subtitle="Genre and emotion" title="Creative Palette">
        <div className="grid gap-6 lg:grid-cols-2">
          <PaletteGroup
            activeItems={setup.genres}
            label="Multiple genres"
            options={genreOptions}
            onToggle={toggleGenre}
          />
          <PaletteGroup
            activeItems={setup.moods}
            label="Multiple tones"
            options={toneOptions}
            onToggle={toggleTone}
          />
        </div>
      </WorkflowPanel>

      <WorkflowPanel number="3" subtitle="Cast design" title="Characters and Voice Placeholders">
        <div className="space-y-4">
          {setup.characters.map((character, index) => {
            const activeTraits = character.personalityTone
              ? character.personalityTone.split(",").map((t) => t.trim()).filter(Boolean)
              : [];

            return (
              <div
                key={`${character.name}-${index}`}
                className="rounded-[1.35rem] border border-white/10 bg-black/20 p-5"
              >
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-starlight/70">
                      Character {index + 1}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-white">
                      {character.name || "Unnamed character"}
                    </h3>
                  </div>
                  {setup.characters.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeCharacter(index)}
                      className="rounded-full border border-red-400/20 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Character name">
                    <input
                      value={character.name}
                      onChange={(event) => updateCharacter(index, "name", event.target.value)}
                      placeholder="Arin Vale"
                      className="input"
                    />
                  </Field>

                  <Field label="Character role">
                    <select
                      value={character.role}
                      onChange={(event) => updateCharacter(index, "role", event.target.value)}
                      className="input"
                    >
                      <option value="">Select a role...</option>
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </Field>

                  <div className="md:col-span-2">
                    <Field label="Character personality / tone">
                      <div className="mb-3 flex flex-wrap gap-2">
                        {personalityOptions.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => togglePersonalityChip(index, chip)}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                              activeTraits.includes(chip)
                                ? "border-gold/40 bg-gold/15 text-gold"
                                : "border-white/10 bg-white/5 text-white/60 hover:border-starlight/30 hover:text-white"
                            }`}
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                      {activeTraits.length > 0 && (
                        <div className="mb-3 flex flex-wrap gap-1">
                          {activeTraits.map((trait) => (
                            <span
                              key={trait}
                              className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs text-gold"
                            >
                              {trait}
                              <button
                                type="button"
                                onClick={() => togglePersonalityChip(index, trait)}
                                className="ml-0.5 opacity-70 hover:opacity-100"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          value={personalityInputs[index] || ""}
                          onChange={(e) =>
                            setPersonalityInputs((prev) => ({ ...prev, [index]: e.target.value }))
                          }
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPersonalityCustom(index); } }}
                          placeholder="Add custom trait and press Enter..."
                          className="input flex-1 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => addPersonalityCustom(index)}
                          className="rounded-full border border-starlight/20 bg-starlight/10 px-4 py-2 text-xs font-semibold text-starlight"
                        >
                          Add
                        </button>
                      </div>
                    </Field>
                  </div>

                  <div className="md:col-span-2">
                    <Field label="Voice style">
                      <select
                        value={character.voiceStyle}
                        onChange={(event) => updateCharacter(index, "voiceStyle", event.target.value)}
                        className="input"
                      >
                        <option value="">Select a voice style...</option>
                        {voiceStyleOptions.map((style) => (
                          <option key={style} value={style}>{style}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addCharacter}
            className="rounded-full border border-starlight/20 bg-starlight/10 px-5 py-3 text-sm font-semibold text-starlight transition hover:bg-starlight/15"
          >
            Add Another Character
          </button>
        </div>
      </WorkflowPanel>

      <WorkflowPanel number="4" subtitle="Save setup" title="Start Scene Builder">
        <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-5">
            <p className="text-xs uppercase tracking-[0.26em] text-white/45">Setup Summary</p>
            <h2 className="mt-3 font-[var(--font-heading)] text-2xl text-white">
              {setup.storyTitle || "Untitled Cinematic Story"}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {[...setup.genres, ...setup.moods, `${setup.numberOfScenes} scenes`].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/72"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-[1.2rem] border border-gold/15 bg-gold/5 p-5">
            <p className="text-xs uppercase tracking-[0.26em] text-gold">Cast</p>
            <p className="mt-3 text-sm leading-7 text-white/72">
              {setup.characters
                .filter((character) => character.name.trim())
                .map((character) => `${character.name} (${character.role || "No role"})`)
                .join(", ") || "Add at least one character before building."}
            </p>
          </div>
        </div>

        {!canStart ? (
          <div className="mt-5 rounded-[1rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-7 text-red-100">
            Complete before starting: <span className="text-gold">{missingRequiredFields.join(", ")}</span>
          </div>
        ) : null}

        <div className="mt-6">
          <button
            type="button"
            onClick={handleStartBuilding}
            disabled={!canStart}
            className="rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-7 py-4 text-center text-sm font-semibold text-slate-950 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start Building Story
          </button>
        </div>
      </WorkflowPanel>
    </form>
  );
}

function PaletteGroup({
  activeItems,
  label,
  options,
  onToggle
}: {
  activeItems: string[];
  label: string;
  options: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={`rounded-[1rem] border px-4 py-3 text-left text-sm font-semibold transition ${
              activeItems.includes(option)
                ? "border-gold/35 bg-gold/10 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:border-starlight/25"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkflowPanel({
  number,
  title,
  subtitle,
  children
}: {
  children: React.ReactNode;
  number: string;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="glass-panel rounded-[1.6rem] p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border border-gold/20 bg-gold/10 text-sm font-bold text-gold">
          {number}
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-starlight/70">{subtitle}</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-3 block text-sm font-semibold text-white">{children}</label>;
}
