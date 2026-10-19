"use client";

import { useState } from "react";
import type { ClipCapability } from "@/lib/film/duration";
import { clipCapability } from "@/lib/film/duration";
import { MAX_STORY_CHARACTERS, MAX_STORY_SCENES, type CreativeBrief, type StudioState } from "@/types/studio";
import { CharacterPanel } from "./character-panel";
import { DecisionFlow, type DecisionPage } from "./decision-flow";
import { FieldAssist } from "./field-assist";

type CharacterHandlers = Pick<Parameters<typeof CharacterPanel>[0], "onCharacter" | "onReference" | "onUpload" | "onVoice" | "onAction">;

/** A row of number pills plus "Let Omni decide", which clears the count. */
function CountChoice({ label, value, min, max, onChange }: { label: string; value?: number; min: number; max: number; onChange: (value?: number) => void }) {
  return <fieldset><legend className="sr-only">{label}</legend><div className="flex flex-wrap gap-2">
    <button type="button" className={`guest-pill ${value === undefined ? "active" : ""}`} aria-pressed={value === undefined} onClick={() => onChange(undefined)}>Let Omni decide</button>
    {Array.from({ length: max - min + 1 }, (_, at) => min + at).map(count => <button type="button" key={count} className={`guest-pill ${value === count ? "active" : ""}`} aria-pressed={value === count} aria-label={`${count} ${label.toLowerCase()}`} onClick={() => onChange(count)}>{count}</button>)}
  </div></fieldset>;
}

export function SetupStep({ projectId, state, busy, capability, onSave, onGenerateScript, onContinue, characters }: {
  projectId: string; state: StudioState; busy: boolean; capability?: ClipCapability;
  onSave: (patch: Record<string, unknown>) => Promise<boolean>; onGenerateScript: () => Promise<void>; onContinue: () => void;
  characters: CharacterHandlers;
}) {
  const [mode, setMode] = useState<"idea" | "script">(state.sourceScript ? "script" : "idea");
  const [idea, setIdea] = useState(state.roughIdea ?? state.premise ?? "");
  const [sourceScript, setSourceScript] = useState(state.sourceScript ?? "");
  const [title, setTitle] = useState(state.title);
  const [visualStyle, setVisualStyle] = useState(state.visualStyle ?? state.world ?? "");
  const [brief, setBrief] = useState<CreativeBrief>(state.creativeBrief ?? {});
  const [assistMode, setAssistMode] = useState(state.assist ?? "guided");
  const [seconds, setSeconds] = useState(state.clipSeconds ?? 5);
  const [language, setLanguage] = useState(state.language ?? "en");
  const [sceneCount, setSceneCount] = useState(state.storyPlan?.sceneCount);
  const [characterCount, setCharacterCount] = useState(state.storyPlan?.characterCount);
  const [rebuilding, setRebuilding] = useState(false);
  const [finding, setFinding] = useState(false);
  const caps = capability ?? clipCapability();
  const ready = mode === "script" ? sourceScript.trim().length > 40 : idea.trim().length > 10;
  // Characters added on the cast page always count, even past the number picked.
  const castCount = characterCount === undefined ? undefined : Math.max(characterCount, state.characters.length);
  const draft = { ...state, premise: idea, roughIdea: idea, title, sourceScript: mode === "script" ? sourceScript : "", visualStyle, creativeBrief: brief, assist: assistMode };
  const saveAll = () => onSave({ title: title.trim() || "Untitled story", premise: idea,
    sourceScript: mode === "script" ? sourceScript : "", visualStyle, creativeBrief: brief, assist: assistMode, clipSeconds: seconds, language,
    storyPlan: { sceneCount: sceneCount ?? null, characterCount: castCount ?? null } });
  const omniCreates = castCount === undefined ? null : castCount - state.characters.length;
  const helper = (field: "title" | "idea" | "visualStyle" | keyof CreativeBrief, label: string, value: string, accept: (value: string) => void) =>
    <FieldAssist key={field} projectId={projectId} state={draft} field={field} label={label} value={value} onAccept={accept} />;
  const pages: DecisionPage[] = [
    { id: "idea", title: "What is your story about?", description: "Start rough. A person, a problem, or a moment is enough. Every AI suggestion after this will build on your idea.", ready,
      content: <><div className="mb-4 flex gap-2">{(["idea", "script"] as const).map(item => <button key={item} type="button" className={`guest-pill ${mode === item ? "active" : ""}`} aria-pressed={mode === item} onClick={() => setMode(item)}>{item === "idea" ? "I have an idea" : "I have a script"}</button>)}</div>
        {mode === "idea" ? <><label className="sr-only" htmlFor="story-idea">Story idea</label><textarea id="story-idea" aria-label="Story idea" className="decision-input" rows={6} maxLength={5000} value={idea} onChange={event => setIdea(event.target.value)} placeholder="A young teacher returns to her mountain village and discovers…" />
          {helper("idea", "develop my idea", idea, setIdea)}</> : <><label className="sr-only" htmlFor="existing-script">Your existing script</label><textarea id="existing-script" className="decision-input" rows={9} value={sourceScript} onChange={event => setSourceScript(event.target.value)} maxLength={24000} placeholder="Paste your script here. We’ll keep your characters and story." /><p className="film-help">We’ll organise your script into scenes while preserving your story.</p></>}
        <details className="mt-5"><summary className="cursor-pointer text-xs text-[var(--muted)]">How much help from Omni would you like?</summary><div className="mt-3 flex gap-2">{(["guided", "custom"] as const).map(item => <button type="button" key={item} className={`guest-pill ${assistMode === item ? "active" : ""}`} aria-pressed={assistMode === item} onClick={() => setAssistMode(item)}>{item === "guided" ? "Offer me options" : "Follow my direction"}</button>)}</div></details></> },
    { id: "scenes", title: "How many scenes?", description: "Each scene becomes one short video clip. Pick a number, or let Omni choose what fits your story.",
      content: <CountChoice label="Scenes" value={sceneCount} min={1} max={MAX_STORY_SCENES} onChange={setSceneCount} /> },
    { id: "cast", title: "Who's in your story?", description: "Choose how many characters you want. Name any you already know, and describe them or add a photo. A photo is optional. Omni creates anyone you leave out.", optional: true,
      content: <>
        <CountChoice label="Characters" value={castCount} min={Math.max(1, state.characters.length)} max={MAX_STORY_CHARACTERS} onChange={setCharacterCount} />
        <p className="film-help" role="status">{omniCreates === null
          ? state.characters.length ? `You've set up ${state.characters.length}. Omni will add anyone else the story needs.` : "Omni will decide who your story needs."
          : `You've set up ${state.characters.length} of ${castCount}.${omniCreates ? ` Omni will create the other ${omniCreates}.` : ""}`}</p>
        {mode === "script" ? <button type="button" className="guest-pill mt-4" disabled={finding || busy} onClick={async () => {
          // The script must be saved first: Omni reads the stored copy.
          setFinding(true); try { if (await saveAll()) await characters.onAction({ action: "detectCast" }); } finally { setFinding(false); }
        }}>{finding ? "Reading your script…" : "Find characters in my script"}</button> : null}
        <div className="mt-5"><CharacterPanel projectId={projectId} state={state} {...characters} /></div>
      </> },
    { id: "title", title: "Give your story a name", description: "A working title is fine. You can change it later.", content: <><input aria-label="Story title" className="decision-input" maxLength={160} value={title} onChange={event => setTitle(event.target.value)} />{helper("title", "suggest a title", title, setTitle)}</> },
    { id: "look", title: "What should it look like?", description: "Describe the visual feel of your story, or ask for options based on your idea.", optional: true,
      content: <><textarea aria-label="Visual style" className="decision-input" rows={3} maxLength={4000} value={visualStyle} onChange={event => setVisualStyle(event.target.value)} placeholder="Natural light, warm colours, a grounded everyday feel…" />{helper("visualStyle", "find the visual style", visualStyle, setVisualStyle)}</> },
    ...([
      ["audience", "Who is this story for?", "Think about who you want watching."],
      ["purpose", "What should your story do?", "Entertain, explain something, or leave the viewer with a feeling."],
      ["tone", "How should it feel?", "The emotional mood should fit your people and their conflict."],
      ["genre", "What kind of story is it?", "Choose a direction, or leave this open."],
      ["ending", "Where should it leave the viewer?", "A resolution, a difficult choice, or an unanswered question."],
    ] as const).map(([field, heading, description]) => ({ id: field, title: heading, description, optional: true,
      content: <><textarea className="decision-input" aria-label={field[0].toUpperCase() + field.slice(1)} rows={3} maxLength={field === "ending" ? 1500 : 500} value={brief[field] ?? ""} onChange={event => setBrief(current => ({ ...current, [field]: event.target.value }))} placeholder="Your answer, or leave open" />{helper(field, `suggest ${field}`, brief[field] ?? "", answer => setBrief(current => ({ ...current, [field]: answer })))}</> })),
    { id: "format", title: "Set the basics", description: "Your story will use landscape video. English generation is currently available.", content: <>
      <label className="block text-sm font-medium" htmlFor="story-language">Language</label><select id="story-language" className="decision-input mt-2" value={language} onChange={event => setLanguage(event.target.value as "en" | "ur")}><option value="en">English</option><option value="ur" disabled>Urdu — Coming soon</option></select>
      <p className="film-help">Urdu drafts are preserved. Urdu video generation is coming soon.</p>
      <fieldset className="mt-6"><legend className="text-sm font-medium">Default scene length</legend><div className="mt-3 flex flex-wrap gap-2">{caps.choices.map(choice => <button type="button" key={choice.seconds} disabled={!choice.available} className={`guest-pill ${seconds === choice.seconds ? "active" : ""}`} aria-pressed={seconds === choice.seconds} onClick={() => setSeconds(choice.seconds)}>{choice.seconds}s{choice.available ? "" : " · Coming soon"}</button>)}</div></fieldset></> },
    { id: "review", title: "Ready to shape your scenes?", description: "We’ll use your story and the decisions you made. You can edit every scene and character afterwards.", ready,
      content: <><dl className="story-review"><dt>Story</dt><dd>{title || "Untitled story"}</dd><dt>Your starting point</dt><dd className="whitespace-pre-wrap">{mode === "script" ? sourceScript : idea}</dd><dt>Scenes</dt><dd>{sceneCount ?? "Omni decides"}</dd><dt>Characters</dt><dd>{castCount ?? "Omni decides"}{state.characters.length ? ` · ${state.characters.map(item => item.name).join(", ")}` : ""}</dd>{visualStyle ? <><dt>Visual feel</dt><dd>{visualStyle}</dd></> : null}{Object.entries(brief).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt className="capitalize">{key}</dt><dd>{value}</dd></div>)}</dl>
        {state.scenes.length ? <div className="mt-5 rounded-xl border border-[var(--line)] p-4"><p className="text-sm">Your story already has {state.scenes.length} scenes.</p><button type="button" className="film-text-button mt-2" disabled={busy || rebuilding} onClick={async () => {
          if (!window.confirm("Rebuild the script from these choices? Existing scenes and takes are archived and can be restored with Undo script change.")) return;
          setRebuilding(true); try { if (await saveAll()) await onGenerateScript(); } finally { setRebuilding(false); }
        }}>Rebuild script from these changes</button></div> : null}</> },
  ];
  return <DecisionFlow storageKey={`story:${projectId}:setup`} pages={pages} onBeforeNext={saveAll} busy={busy || rebuilding}
    finish={state.scenes.length ? onContinue : onGenerateScript} finishLabel={state.scenes.length ? "Review scenes" : "Build my script"} />;
}
