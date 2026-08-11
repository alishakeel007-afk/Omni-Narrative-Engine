"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { CreateStorySetupForm } from "@/components/create-story-setup-form";
import { useStory } from "@/context/StoryContext";
import { DEFAULT_STORY_SETUP } from "@/lib/story-storage";
import { genres as genreOptions, moods as moodOptions, storyModes } from "@/lib/mock-data";
import type { StorySetupData } from "@/types/story";

type ScenarioOption = {
  description: string;
  difficulty: StorySetupData["difficulty"];
  theme: string;
  title: string;
};

const difficultyOptions: StorySetupData["difficulty"][] = ["Easy", "Normal", "Hard", "Adaptive"];

const roleOptions = [
  "Warrior",
  "Mage",
  "Rogue",
  "Scholar",
  "Relic Interpreter",
  "Detective",
  "Pilot",
  "Inventor"
];

const traitOptions = [
  "Brave",
  "Curious",
  "Protective",
  "Strategic",
  "Empathetic",
  "Reckless",
  "Observant",
  "Funny"
];

const attributeLabels: Array<[
  keyof StorySetupData["characterAttributes"],
  string
]> = [
  ["strength", "STR"],
  ["intelligence", "INT"],
  ["charisma", "CHA"],
  ["agility", "AGL"],
  ["wisdom", "WIS"],
  ["endurance", "END"]
];

const scenarioCatalog: Record<string, ScenarioOption[]> = {
  Adventure: [
    {
      description:
        "A skyship crew races toward a floating ruin before a rival expedition steals the map core.",
      difficulty: "Normal",
      theme: "Discovery",
      title: "Skyreach Expedition"
    },
    {
      description:
        "A desert caravan finds an impossible city buried under glass, still guarded by old machines.",
      difficulty: "Hard",
      theme: "Survival",
      title: "City Under Glass"
    }
  ],
  Fantasy: [
    {
      description:
        "A hidden gate opens beneath a forgotten observatory, and the ancient machine inside already knows the hero's name.",
      difficulty: "Adaptive",
      theme: "Ancient magic",
      title: "The Whispering Gate"
    },
    {
      description:
        "A moonlit kingdom loses its crown to a talking shadow, forcing unlikely allies into the royal catacombs.",
      difficulty: "Normal",
      theme: "Lost kingdom",
      title: "Crown of Moon Ash"
    }
  ],
  Horror: [
    {
      description:
        "A night guard hears jokes over the museum speakers while a cursed exhibit rearranges every hallway.",
      difficulty: "Hard",
      theme: "Haunted place",
      title: "The Laughing Exhibit"
    },
    {
      description:
        "A family lighthouse begins blinking warnings from the future, but every warning costs one memory.",
      difficulty: "Normal",
      theme: "Psychological dread",
      title: "Blackwater Beacon"
    }
  ],
  Mystery: [
    {
      description:
        "A detective investigates a camera that records tomorrow's crime before anyone has committed it.",
      difficulty: "Normal",
      theme: "Time clue",
      title: "The Tomorrow Frame"
    },
    {
      description:
        "A sealed academy hides one student who has existed in every graduating class for a century.",
      difficulty: "Hard",
      theme: "Secret identity",
      title: "The Eternal Student"
    }
  ],
  Romance: [
    {
      description:
        "Two rival diplomats must fake an engagement to stop a war, then discover the lie is easier than the truth.",
      difficulty: "Easy",
      theme: "Political romance",
      title: "Treaty of Hearts"
    },
    {
      description:
        "A musician receives love letters from a future where their greatest song has already been forgotten.",
      difficulty: "Normal",
      theme: "Bittersweet time",
      title: "Letters in the Last Song"
    }
  ],
  "Sci-Fi": [
    {
      description:
        "A damaged space station is trapped in a solar storm with a heroic pilot, a nervous mechanic, and a villain commander.",
      difficulty: "Normal",
      theme: "Station crisis",
      title: "Core Breach"
    },
    {
      description:
        "A flooded future city uses rainwater memories as evidence, until one recording proves the mayor erased a district.",
      difficulty: "Adaptive",
      theme: "Memory tech",
      title: "Rain Archive"
    }
  ],
  "Custom Genre": [
    {
      description:
        "A flexible starting point for a user-authored world, tone, conflict, and cast.",
      difficulty: "Adaptive",
      theme: "User-authored",
      title: "Custom Story Seed"
    }
  ]
};

export function StorySetupForm() {
  const { setup } = useStory();

  if (setup.mode === "custom") {
    return <CreateStorySetupForm />;
  }

  return <GuidedStorySetupForm />;
}

function GuidedStorySetupForm() {
  const router = useRouter();
  const { beginStoryFromSetup, saveSetupOnly, setup, updateSetup } = useStory();
  const visibleStoryModes =
    setup.mode === "custom"
      ? storyModes.filter((mode) => mode.id === "custom")
      : storyModes;
  const scenarios = useMemo(
    () => scenarioCatalog[setup.genre] ?? scenarioCatalog["Custom Genre"],
    [setup.genre]
  );
  const missingRequiredFields = [
    !setup.storyTitle.trim() ? "story title" : null,
    !setup.scenarioTitle.trim() ? "scenario" : null,
    setup.characters.every((character) => !character.name.trim()) ? "at least one character" : null,
    setup.characters.every((character) => !character.role.trim()) ? "at least one character role" : null,
    setup.mode === "custom" && !setup.startingIdea.trim() ? "custom starting idea" : null
  ].filter(Boolean) as string[];
  const canBeginStory = missingRequiredFields.length === 0;

  const handleBeginStory = () => {
    if (!canBeginStory) return;
    beginStoryFromSetup();
    router.push("/story/play");
  };

  const handleOpenDashboard = () => {
    saveSetupOnly();
    router.push("/dashboard");
  };

  const selectScenario = (scenario: ScenarioOption) => {
    updateSetup({
      difficulty: scenario.difficulty,
      scenarioDescription: scenario.description,
      scenarioTitle: scenario.title,
      selectedTemplate: scenario.title,
      startingIdea: setup.mode === "custom" ? setup.startingIdea : scenario.description
    });
  };

  const toggleGenre = (genre: string) => {
    const nextGenres = setup.genres.includes(genre)
      ? setup.genres.length === 1 ? setup.genres : setup.genres.filter((item) => item !== genre)
      : [...setup.genres, genre];

    updateSetup({
      genre: nextGenres[0],
      genres: nextGenres
    });
  };

  const toggleMood = (mood: string) => {
    const nextMoods = setup.moods.includes(mood)
      ? setup.moods.length === 1 ? setup.moods : setup.moods.filter((item) => item !== mood)
      : [...setup.moods, mood];

    updateSetup({
      mood: nextMoods[0],
      moods: nextMoods
    });
  };

  const updateCharacter = (
    index: number,
    field: "name" | "role",
    value: string
  ) => {
    const nextCharacters = setup.characters.map((character, characterIndex) =>
      characterIndex === index ? { ...character, [field]: value } : character
    );

    updateSetup({
      characters: nextCharacters,
      ...(index === 0 && field === "name" ? { characterName: value } : {}),
      ...(index === 0 && field === "role" ? { characterRole: value } : {})
    });
  };

  const toggleCharacterTrait = (index: number, trait: string) => {
    const nextCharacters = setup.characters.map((character, characterIndex) => {
      if (characterIndex !== index) return character;

      const nextTraits = character.traits.includes(trait)
        ? character.traits.filter((item) => item !== trait)
        : [...character.traits, trait].slice(0, 3);

      return {
        ...character,
        traits: nextTraits
      };
    });

    updateSetup({
      characters: nextCharacters,
      ...(index === 0 ? { characterTraits: nextCharacters[0].traits } : {})
    });
  };

  const addCharacter = () => {
    updateSetup({
      characters: [
        ...setup.characters,
        {
          name: "",
          personalityTone: "Balanced cinematic tone",
          role: roleOptions[0],
          traits: [],
          voiceStyle: "Voice style placeholder"
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

  const updateAttribute = (
    attribute: keyof StorySetupData["characterAttributes"],
    value: number
  ) => {
    updateSetup({
      characterAttributes: {
        ...setup.characterAttributes,
        [attribute]: value
      }
    });
  };

  return (
    <form className="space-y-6">
      <WorkflowPanel
        number="1"
        title={setup.mode === "custom" ? "Custom story mode" : "Choose story mode"}
        subtitle="Story mode"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {visibleStoryModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => updateSetup({ mode: mode.id })}
              className={`rounded-[1.4rem] border p-5 text-left transition ${
                setup.mode === mode.id
                  ? "border-gold/35 bg-gold/10 shadow-glow"
                  : "border-white/10 bg-white/5 hover:border-starlight/25 hover:bg-white/10"
              }`}
            >
              <p className="text-lg font-semibold text-white">{mode.title}</p>
              <p className="mt-3 text-sm leading-7 text-white/90">{mode.description}</p>
            </button>
          ))}
        </div>
      </WorkflowPanel>

      <WorkflowPanel number="2" title="Genre and scenario" subtitle="Story foundation">
        <div className="grid gap-5 lg:grid-cols-[0.7fr_1fr]">
          <div>
            <Label>Genre palette</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {genreOptions.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => toggleGenre(genre)}
                  className={`rounded-[1rem] border px-4 py-3 text-left text-sm font-semibold transition ${
                    setup.genres.includes(genre)
                      ? "border-starlight/35 bg-starlight/10 text-starlight"
                      : "border-white/10 bg-black/20 text-white/70 hover:border-gold/25"
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Scenario</Label>
            <div className="grid gap-3">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.title}
                  type="button"
                  onClick={() => selectScenario(scenario)}
                  className={`rounded-[1.2rem] border p-4 text-left transition ${
                    setup.scenarioTitle === scenario.title
                      ? "border-gold/35 bg-gold/10"
                      : "border-white/10 bg-black/20 hover:border-starlight/25"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-white">{scenario.title}</p>
                    <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs text-white/90">
                      {scenario.theme}
                    </span>
                    <span className="rounded-full bg-starlight/10 px-2 py-0.5 text-xs text-starlight">
                      {scenario.difficulty}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-white/90">{scenario.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </WorkflowPanel>

      <WorkflowPanel number="3" title="Tone and difficulty" subtitle="Experience settings">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <Label>Emotional palette</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {moodOptions.map((mood) => (
                <button
                  key={mood}
                  type="button"
                  onClick={() => toggleMood(mood)}
                  className={`rounded-[1rem] border px-4 py-3 text-sm transition ${
                    setup.moods.includes(mood)
                      ? "border-gold/35 bg-gold/10 text-white"
                      : "border-white/10 bg-white/5 text-white/70 hover:border-starlight/25"
                  }`}
                >
                  {mood}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Difficulty</Label>
            <div className="grid grid-cols-2 gap-3">
              {difficultyOptions.map((difficulty) => (
                <button
                  key={difficulty}
                  type="button"
                  onClick={() => updateSetup({ difficulty })}
                  className={`rounded-[1rem] border px-4 py-3 text-sm transition ${
                    setup.difficulty === difficulty
                      ? "border-starlight/35 bg-starlight/10 text-starlight"
                      : "border-white/10 bg-white/5 text-white/70 hover:border-gold/25"
                  }`}
                >
                  {difficulty}
                </button>
              ))}
            </div>
          </div>
        </div>
      </WorkflowPanel>

      <WorkflowPanel number="4" title="Character identity" subtitle="Cast setup">
        <div className="mb-6 grid gap-5 md:grid-cols-2">
          <Field label="Story Title">
            <input
              value={setup.storyTitle}
              onChange={(event) => updateSetup({ storyTitle: event.target.value })}
              className="w-full rounded-[1rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-gold/30"
            />
          </Field>
          <div className="rounded-[1rem] border border-starlight/15 bg-starlight/5 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-starlight/80">
              Cast Size
            </p>
            <p className="mt-2 text-sm text-white/70">
              {setup.characters.length} character{setup.characters.length === 1 ? "" : "s"} in this setup.
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          {setup.characters.map((character, index) => (
            <div key={`character-${index}`} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-white/75">
                    {index === 0 ? "Primary Character" : `Character ${index + 1}`}
                  </p>
                  <p className="mt-1 text-sm text-white/90">
                    {character.name || "Unnamed character"}
                  </p>
                </div>
                {setup.characters.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeCharacter(index)}
                    className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Character Name">
                  <input
                    value={character.name}
                    onChange={(event) => updateCharacter(index, "name", event.target.value)}
                    className="w-full rounded-[1rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-gold/30"
                  />
                </Field>
                <Field label="Role / Class">
                  <select
                    value={character.role}
                    onChange={(event) => updateCharacter(index, "role", event.target.value)}
                    className="w-full rounded-[1rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-gold/30"
                  >
                    {roleOptions.map((role) => (
                      <option key={role}>{role}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="mt-4">
                <Label>Traits: choose up to 3</Label>
                <div className="flex flex-wrap gap-2">
                  {traitOptions.map((trait) => (
                    <button
                      key={trait}
                      type="button"
                      onClick={() => toggleCharacterTrait(index, trait)}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                        character.traits.includes(trait)
                          ? "border-gold/30 bg-gold/10 text-gold"
                          : "border-white/10 bg-white/5 text-white/90 hover:border-starlight/25"
                      }`}
                    >
                      {trait}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addCharacter}
            className="rounded-full border border-starlight/20 bg-starlight/10 px-5 py-3 text-sm font-semibold text-starlight transition hover:bg-starlight/15"
          >
            Add Another Character
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {attributeLabels.map(([attribute, label]) => (
            <div key={attribute} className="rounded-[1rem] border border-white/10 bg-black/20 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="text-sm text-gold">{setup.characterAttributes[attribute]}</p>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                value={setup.characterAttributes[attribute]}
                onChange={(event) => updateAttribute(attribute, Number(event.target.value))}
                className="w-full accent-gold"
              />
            </div>
          ))}
        </div>
      </WorkflowPanel>

      <WorkflowPanel number="5" title="Starting direction" subtitle="Guided and custom always remain available">
        {setup.mode === "custom" ? (
          <Field label="Write your starting story idea">
            <textarea
              value={setup.startingIdea}
              onChange={(event) => updateSetup({ startingIdea: event.target.value })}
              className="min-h-36 w-full rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-4 text-sm leading-7 text-white outline-none focus:border-gold/30"
            />
          </Field>
        ) : (
          <div className="rounded-[1.2rem] border border-starlight/15 bg-starlight/5 p-5">
            <p className="text-xs uppercase tracking-[0.26em] text-starlight/80">
              Guided opening
            </p>
            <p className="mt-3 text-sm leading-7 text-white/72">
              {setup.scenarioDescription || DEFAULT_STORY_SETUP.scenarioDescription}
            </p>
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-5">
            <p className="text-xs uppercase tracking-[0.26em] text-white/75">Run Summary</p>
            <h2 className="mt-3 font-[var(--font-heading)] text-2xl text-white">
              {setup.storyTitle || DEFAULT_STORY_SETUP.storyTitle}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                setup.mode,
                ...setup.genres,
                setup.scenarioTitle,
                ...setup.moods,
                setup.difficulty
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs capitalize text-white/72"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-[1.2rem] border border-gold/15 bg-gold/5 p-5">
            <p className="text-xs uppercase tracking-[0.26em] text-gold">Character Seed</p>
            <p className="mt-3 text-sm leading-7 text-white/72">
              {setup.characters
                .filter((character) => character.name.trim())
                .map((character) => `${character.name} (${character.role || "No role"})`)
                .join(", ") || DEFAULT_STORY_SETUP.characterName} will appear in the story.
            </p>
          </div>
        </div>

        {!canBeginStory ? (
          <div className="mt-5 rounded-[1rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-7 text-red-100">
            Complete before starting: <span className="text-gold">{missingRequiredFields.join(", ")}</span>
          </div>
        ) : (
          <div className="mt-5 rounded-[1rem] border border-starlight/15 bg-starlight/5 px-4 py-3 text-sm leading-7 text-white/72">
            Setup is ready. Guided Mode shows AI choices; Custom Mode keeps only your own writing input.
          </div>
        )}

        <div className="mt-6 flex flex-col gap-4 sm:flex-row">
          <button
            type="button"
            onClick={handleBeginStory}
            disabled={!canBeginStory}
            className="rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-7 py-4 text-center text-sm font-bold text-slate-950 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale"
          >
            Begin Active Story
          </button>
          <button
            type="button"
            onClick={handleOpenDashboard}
            className="rounded-full border border-white/10 bg-white/5 px-7 py-4 text-center text-sm font-semibold text-white/82 transition-all duration-300 hover:border-gold/25 hover:bg-white/10 active:scale-[0.98]"
          >
            Save and View Dashboard
          </button>
        </div>
      </WorkflowPanel>

      {/* Floating Action Bar */}
      {canBeginStory && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-6 rounded-full border border-starlight/30 bg-black/60 px-8 py-4 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-starlight/20 text-starlight">
                <Check className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-starlight">Ready to Begin</p>
                <p className="text-[10px] text-white/90">Story foundation is complete.</p>
              </div>
            </div>
            <button
              onClick={handleBeginStory}
              className="rounded-full bg-starlight px-6 py-2 text-xs font-black uppercase tracking-tighter text-slate-950 transition hover:scale-105 active:scale-95"
            >
              Start Story
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function WorkflowPanel({
  number,
  title,
  subtitle,
  children
}: {
  number: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel rounded-[1.6rem] p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[1rem] border border-gold/20 bg-gold/10 text-sm font-bold text-gold">
          {number}
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-white/75">{subtitle}</p>
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
  label: string;
  children: React.ReactNode;
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
