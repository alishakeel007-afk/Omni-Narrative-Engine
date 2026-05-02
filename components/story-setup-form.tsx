"use client";

import { useRouter } from "next/navigation";
import { GenreCard } from "@/components/genre-card";
import { ModeSelectionCard } from "@/components/mode-selection-card";
import { useStory } from "@/context/StoryContext";
import { genres, guidedTemplates, moods, storyModes } from "@/lib/mock-data";
import { DEFAULT_STORY_SETUP } from "@/lib/story-storage";

export function StorySetupForm() {
  const router = useRouter();
  const { beginStoryFromSetup, saveSetupOnly, setup, updateSetup } = useStory();
  const missingRequiredFields = [
    !setup.storyTitle.trim() ? "story title" : null,
    !setup.characterName.trim() ? "character name" : null,
    !setup.characterRole.trim() ? "character role" : null,
    setup.mode === "custom" && !setup.startingIdea.trim() ? "custom starting idea" : null
  ].filter(Boolean) as string[];
  const canBeginStory = missingRequiredFields.length === 0;

  const handleBeginStory = () => {
    if (!canBeginStory) return;
    beginStoryFromSetup();
    router.push("/story");
  };

  const handleOpenDashboard = () => {
    saveSetupOnly();
    router.push("/dashboard");
  };

  return (
    <section className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10">
          <p className="text-xs uppercase tracking-[0.32em] text-starlight/80">Story Setup</p>
          <h1 className="mt-3 font-[var(--font-heading)] text-4xl text-white sm:text-5xl">
            Launch a New Narrative
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-white/68">
            Configure your world, define the protagonist, and choose whether the story follows
            guided AI options or your own custom direction from the very first scene.
          </p>
        </div>

        <form className="glass-panel rounded-[2rem] p-6 sm:p-8">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Story Title">
              <input
                value={setup.storyTitle}
                onChange={(event) => updateSetup({ storyTitle: event.target.value })}
                className="w-full rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-gold/30"
              />
            </Field>
            <Field label="Main Character Name">
              <input
                value={setup.characterName}
                onChange={(event) => updateSetup({ characterName: event.target.value })}
                className="w-full rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-gold/30"
              />
            </Field>
            <Field label="Character Role">
              <input
                value={setup.characterRole}
                onChange={(event) => updateSetup({ characterRole: event.target.value })}
                className="w-full rounded-[1.2rem] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-gold/30"
              />
            </Field>
            <Field label="Story Mood">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {moods.map((mood) => (
                  <button
                    key={mood}
                    type="button"
                    onClick={() => updateSetup({ mood })}
                    className={`rounded-[1.1rem] border px-4 py-3 text-sm transition ${
                      setup.mood === mood
                        ? "border-gold/35 bg-gold/10 text-white"
                        : "border-white/10 bg-white/5 text-white/70 hover:border-starlight/25"
                    }`}
                  >
                    {mood}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <Field label="Genre Selection" className="mt-8">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {genres.map((genre) => (
                <GenreCard
                  key={genre}
                  genre={genre}
                  selected={setup.genre === genre}
                  onClick={() => updateSetup({ genre })}
                />
              ))}
            </div>
          </Field>

          <Field label="Story Mode" className="mt-8">
            <div className="grid gap-4 lg:grid-cols-2">
              {storyModes.map((mode) => (
                <ModeSelectionCard
                  key={mode.id}
                  title={mode.title}
                  description={mode.description}
                  selected={setup.mode === mode.id}
                  onClick={() => updateSetup({ mode: mode.id })}
                />
              ))}
            </div>
          </Field>

          {setup.mode === "custom" ? (
            <Field label="Write your starting story idea..." className="mt-8">
              <textarea
                value={setup.startingIdea}
                onChange={(event) => updateSetup({ startingIdea: event.target.value })}
                className="min-h-40 w-full rounded-[1.4rem] border border-white/10 bg-black/20 px-4 py-4 text-sm leading-7 text-white outline-none focus:border-gold/30"
              />
            </Field>
          ) : (
            <Field label="Guided Story Templates" className="mt-8">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {guidedTemplates.map((template) => (
                  <button
                    key={template}
                    type="button"
                    onClick={() => updateSetup({ selectedTemplate: template })}
                    className={`rounded-[1.3rem] border px-4 py-5 text-left transition ${
                      setup.selectedTemplate === template
                        ? "border-starlight/35 bg-starlight/10 shadow-glow"
                        : "border-white/10 bg-white/5 hover:border-gold/25 hover:bg-white/10"
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">{template}</p>
                  </button>
                ))}
              </div>
            </Field>
          )}

          <div className="mt-8 rounded-[1.6rem] border border-gold/15 bg-gold/5 p-5">
            <p className="text-sm leading-7 text-white/74">
              Hybrid flow is always enabled: even in Guided Story Mode, players will still be able
              to write their own custom action during each story scene.
            </p>
          </div>

          {!canBeginStory ? (
            <div className="mt-6 rounded-[1.4rem] border border-starlight/15 bg-starlight/5 px-4 py-3 text-sm leading-7 text-white/72">
              Complete the following before starting:
              <span className="ml-2 text-gold">{missingRequiredFields.join(", ")}</span>
            </div>
          ) : (
            <div className="mt-6 rounded-[1.4rem] border border-starlight/15 bg-starlight/5 px-4 py-3 text-sm leading-7 text-white/72">
              Setup is ready. You can begin the prototype story flow now.
            </div>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[1.6rem] border border-starlight/15 bg-starlight/8 p-5">
              <p className="text-xs uppercase tracking-[0.28em] text-starlight/82">
                Live Story Summary
              </p>
              <h2 className="mt-3 font-[var(--font-heading)] text-2xl text-white">
                {setup.storyTitle || DEFAULT_STORY_SETUP.storyTitle}
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {[setup.genre, setup.mood, setup.mode === "custom" ? "Custom Mode" : "Guided Mode"].map(
                  (item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/72"
                    >
                      {item}
                    </span>
                  )
                )}
              </div>
              <p className="mt-4 text-sm leading-7 text-white/72">
                {setup.characterName || DEFAULT_STORY_SETUP.characterName} begins as{" "}
                {setup.characterRole || DEFAULT_STORY_SETUP.characterRole}.
              </p>
            </div>

            <div className="rounded-[1.6rem] border border-white/10 bg-black/20 p-5">
              <p className="text-xs uppercase tracking-[0.28em] text-gold">Starting Hook</p>
              <p className="mt-3 text-sm leading-7 text-white/72">
                {setup.mode === "custom"
                  ? setup.startingIdea || DEFAULT_STORY_SETUP.startingIdea
                  : `Template focus: ${setup.selectedTemplate}. The story page will still keep the custom action box visible for hybrid control.`}
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <button
              type="button"
              onClick={handleBeginStory}
              disabled={!canBeginStory}
              className="rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-7 py-4 text-center text-sm font-semibold text-slate-950 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Begin Story Experience
            </button>
            <button
              type="button"
              onClick={handleOpenDashboard}
              className="rounded-full border border-white/10 bg-white/5 px-7 py-4 text-center text-sm font-semibold text-white/82 transition hover:border-gold/25 hover:bg-white/10"
            >
              View Dashboard
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  className = ""
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-3 block text-sm font-semibold text-white">{label}</label>
      {children}
    </div>
  );
}
