"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Check, Loader2, Lock, RotateCcw } from "lucide-react";
import { FILM_STEPS } from "@/lib/film/steps";
import { FILM_LANGUAGES } from "@/lib/film/language";
import { CLIP_CHOICES, clipCapability } from "@/lib/film/duration";
import {
  STUDIO_ENTRY_LIMIT,
  readStudioEntry,
  saveStudioEntry,
  studioEntryPath,
  ACTIVE_ENTRY_KEY,
  updateStudioEntry,
} from "@/lib/studio/entry";
import { DecisionFlow } from "@/components/film/decision-flow";
import { FieldAssist } from "@/components/film/field-assist";
import { EMPTY_STUDIO } from "@/types/studio";
import type { FilmAssist, FilmLanguage, StudioState } from "@/types/studio";

/**
 * The landing page's interactive demo.
 *
 * This replaces a chat window that no longer resembled the product. A visitor
 * completes the real Step 1 — the same decisions, wording and constraints — and
 * then sees a real Step 2 draft produced by the product's own script generator.
 * Nothing here is a mock-up.
 *
 * Everything they choose is kept in this browser and carried through sign-up,
 * so the account they create opens on their own film rather than an empty one.
 */

/** Concrete starting points for Guided mode, offered before anything is typed. */
const GUIDED_IDEAS = [
  {
    label: "The last tape",
    idea: "A night caretaker at a shuttered concert hall finds a tape of a performance that never happened, and the musician on it is still waiting.",
  },
  {
    label: "The long commute",
    idea: "Two strangers share the same late train every night for a year without speaking, until one of them leaves something behind on purpose.",
  },
  {
    label: "Lighthouse weather",
    idea: "A keeper who logs the weather for a coast nobody sails any more starts receiving replies to reports she never sent.",
  },
  {
    label: "The understudy",
    idea: "An understudy who has never performed is told the lead will not return, and has one afternoon to decide whose version of the play to stage.",
  },
];


type Draft = {
  idea: string;
  assist: FilmAssist;
  language: FilmLanguage;
  visualStyle: string;
  clipSeconds: number;
  sourceScript?: string;
};

type Preview = {
  id?: string;
  state: StudioState;
  remaining: number;
  generationBlocked: string | null;
};

export function GuestWorkflow({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const capability = useMemo(() => clipCapability(), []);
  const [draft, setDraft] = useState<Draft>({
    idea: "",
    assist: "guided",
    language: "en",
    visualStyle: "",
    clipSeconds: capability.defaultSeconds,
  });
  const [stage, setStage] = useState<"setup" | "preview" | "generate" | "edit">("setup");
  const [restored, setRestored] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewDraft, setPreviewDraft] = useState("");
  const effectivePreview = JSON.stringify(draft) === previewDraft ? preview : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<string | null>(null);
  const entryId = useRef<string | null>(null);

  // A previously saved idea comes back if they reload before signing up.
  useEffect(() => {
    try {
      const activeId = window.localStorage.getItem(ACTIVE_ENTRY_KEY);
      const active = readStudioEntry(activeId);
      if (active) {
        entryId.current = activeId;
        setDraft(current => ({ ...current, idea: active.text, ...active.setup }));
        return;
      }
      for (const key of Object.keys(window.localStorage)) {
        if (!key.startsWith("omni-studio-entry:")) continue;
        const entry = readStudioEntry(key.slice("omni-studio-entry:".length));
        if (entry?.text) {
          entryId.current = key.slice("omni-studio-entry:".length);
          setDraft((current) => ({
            ...current,
            idea: entry.text,
            ...(entry.setup ?? {}),
          }));
          break;
        }
      }
    } catch {
      /* The demo works without a stored draft. */
    } finally { setRestored(true); }
  }, []);

  useEffect(() => {
    if (!draft.idea.trim()) return;
    try {
      entryId.current = updateStudioEntry(entryId.current, draft.idea, {
        guestProjectId: effectivePreview?.id,
        setup: { assist: draft.assist, language: draft.language, visualStyle: draft.visualStyle,
          clipSeconds: draft.clipSeconds, sourceScript: draft.sourceScript },
      });
    } catch { /* The explicit Continue action reports storage failures. */ }
  }, [draft, effectivePreview?.id]);

  // The landing page's genre cards dispatch an idea into this form.
  useEffect(() => {
    const listen = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.trim()) {
        setDraft((current) => ({ ...current, idea: detail.trim() }));
        setStage("setup");
      }
    };
    window.addEventListener("omni:home-prompt", listen);
    return () => window.removeEventListener("omni:home-prompt", listen);
  }, []);

  const language = FILM_LANGUAGES.find((item) => item.id === draft.language) ?? FILM_LANGUAGES[0];
  const ready = draft.idea.trim().length >= 10;
  const selectStage = (index: number) => {
    if (index === 0) setStage("setup");
    else if (index === 1) setStage("preview");
    else setStage(index === 2 ? "generate" : "edit");
  };

  async function buildPreview() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    // One id per attempt, so retrying after a network failure does not spend a
    // second model turn on the same request.
    request.current = request.current ?? crypto.randomUUID();
    try {
      const response = await fetch("/api/studio/guest/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: draft.idea.trim(),
          assist: draft.assist,
          language: draft.language,
          visualStyle: draft.visualStyle.trim() || undefined,
          clipSeconds: draft.clipSeconds,
          sourceScript: draft.sourceScript,
          requestId: request.current,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "That draft could not be built.");
      setPreview({
        id: body.id,
        state: body.state,
        remaining: body.remaining ?? 0,
        generationBlocked: body.generationBlocked ?? null,
      });
      setStage("preview");
      setPreviewDraft(JSON.stringify(draft));
      request.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That draft could not be built.");
    } finally {
      setBusy(false);
    }
  }

  /** Carries every choice through authentication. */
  function continueToAccount(target: "signup" | "auth") {
    try {
      const id = updateStudioEntry(entryId.current, draft.idea.trim(), {
        guestProjectId: effectivePreview?.id,
        setup: {
          assist: draft.assist,
          language: draft.language,
          visualStyle: draft.visualStyle.trim() || undefined,
          clipSeconds: draft.clipSeconds,
          sourceScript: draft.sourceScript,
        },
      });
      router.push(`/${target}?next=${encodeURIComponent(studioEntryPath(id))}` as Route);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your idea could not be saved.");
    }
  }

  return (
    <section
      id="trial-conversation"
      className={`guest-flow ${embedded ? "embedded" : ""}`}
      aria-label="Try the four-step workflow"
    >
      <div className="guest-progress-overview">
      <ol className="guest-steps" aria-label="The four steps">
        {FILM_STEPS.map((step, index) => {
          const active = ["setup", "preview", "generate", "edit"][index] === stage;
          const reached = index === 0 || (index === 1 && Boolean(effectivePreview));
          const circleFill = index === 0 ? (effectivePreview ? 100 : ready ? 55 : 0) : index === 1 && effectivePreview ? 60 : 0;
          return (
            <li
              key={step.id}
              className={`${reached ? "reached" : ""} ${index > 1 ? "locked" : ""}`}
              aria-current={active ? "step" : undefined}
            >
              <button type="button" onClick={() => selectStage(index)} aria-current={active ? "step" : undefined}>
                <span className="guest-step-number" style={{ "--story-circle-fill": `${circleFill}%` } as CSSProperties}><span>{index + 1}</span></span>
                <span className="guest-step-title">{step.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="story-progress-track" role="progressbar" aria-label="Story preview progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={effectivePreview ? 42 : ready ? 20 : 0}>
        <span className="story-progress-fill" style={{ width: `${effectivePreview ? 56 : ready ? 27 : 0}%` }} />
      </div>
      </div>

      {!restored ? <p className="guest-panel guest-note" role="status">Opening your saved idea…</p> : stage === "setup" ? (
        <div className="guest-panel">
          <DecisionFlow storageKey="story:guest:setup" busy={busy} pages={[
            { id: "idea", title: "What is your story about?", description: "A rough idea is enough. We’ll build on your people, place and conflict.", ready, content: <>
              <div className="guest-field"><label htmlFor="guest-idea" className="sr-only">What is your story about?</label><textarea id="guest-idea" value={draft.idea} maxLength={5000} onChange={event => setDraft({ ...draft, idea: event.target.value })} rows={4} dir={language.rtl ? "rtl" : "ltr"} placeholder="A person, a problem, or a moment…" /></div>
              <FieldAssist projectId="guest" state={{ ...EMPTY_STUDIO, premise: draft.idea, roughIdea: draft.idea, sourceScript: draft.sourceScript, assist: draft.assist }} field="idea" label="develop my rough idea" value={draft.idea} onAccept={idea => setDraft({ ...draft, idea })} />
              {!draft.idea.trim() ? <details className="mt-4"><summary className="cursor-pointer text-xs">Need a starting point?</summary><div className="guest-pills mt-3">{GUIDED_IDEAS.map(option => <button type="button" key={option.label} className="guest-pill" onClick={() => setDraft({ ...draft, idea: option.idea })}>{option.label}</button>)}</div></details> : null}
              <details className="guest-field mt-4"><summary>Already have a script?</summary><label htmlFor="guest-script">Your existing script</label><textarea id="guest-script" rows={5} maxLength={STUDIO_ENTRY_LIMIT} value={draft.sourceScript ?? ""} onChange={event => setDraft({ ...draft, sourceScript: event.target.value, idea: draft.idea || "A short story based on the supplied script." })} /></details>
            </> },
            { id: "look", title: "Find your story’s look", description: "Leave this open, write your own direction, or ask for options that suit your rough story.", optional: true, content: <>
              <div className="guest-field"><label htmlFor="guest-style">Visual style</label><textarea id="guest-style" rows={3} maxLength={300} value={draft.visualStyle} onChange={event => setDraft({ ...draft, visualStyle: event.target.value })} /></div>
              <FieldAssist projectId="guest" state={{ ...EMPTY_STUDIO, premise: draft.idea, roughIdea: draft.idea, sourceScript: draft.sourceScript, visualStyle: draft.visualStyle, assist: draft.assist }} field="visualStyle" label="suggest a look for my story" value={draft.visualStyle} onAccept={visualStyle => setDraft({ ...draft, visualStyle: visualStyle.slice(0, 300) })} />
            </> },
            { id: "basics", title: "Choose the basics", description: "You can revisit these choices after signing in.", content: <>
              <div className="guest-field"><span className="guest-label">Help from Omni</span><div className="guest-pills">{([ ["guided", "Offer me options"], ["custom", "Follow my direction"] ] as const).map(([assist, title]) => <button type="button" key={assist} className={`guest-pill ${draft.assist === assist ? "active" : ""}`} onClick={() => setDraft({ ...draft, assist })}>{title}</button>)}</div></div>
              <div className="guest-field"><span className="guest-label">Language</span><div className="guest-pills">{FILM_LANGUAGES.map(option => <button type="button" key={option.id} className={`guest-pill ${draft.language === option.id ? "active" : ""}`} onClick={() => setDraft({ ...draft, language: option.id })}>{option.label}{option.status ? ` · ${option.status}` : ""}</button>)}</div><p className="guest-note">{language.note}</p></div>
              <div className="guest-field"><span className="guest-label">Scene length</span><div className="guest-pills">{CLIP_CHOICES.map(seconds => { const option = capability.choices.find(item => item.seconds === seconds); return <button type="button" key={seconds} disabled={!option?.available} className={`guest-pill ${draft.clipSeconds === seconds ? "active" : ""}`} onClick={() => setDraft({ ...draft, clipSeconds: seconds })}>{seconds}s{option?.available ? "" : " · Coming soon"}</button>; })}</div></div>
            </> },
            { id: "review", title: "See your idea become scenes", description: "Try a script preview, or carry your saved idea straight into your account.", ready, content: <>
              <p className="whitespace-pre-wrap text-sm leading-7">{draft.idea}</p>{draft.visualStyle ? <p className="film-help">Visual style: {draft.visualStyle}</p> : null}
              {error ? <p className="guest-error" role="alert">{error}</p> : null}
              <button type="button" className="guest-back mt-5" disabled={!ready || busy} onClick={() => continueToAccount("signup")}>Continue without a preview</button>
              <p className="guest-note mt-3">Omni help and previews share three free guest turns.</p>
            </> },
          ]} finish={buildPreview} finishLabel={busy ? "Drafting your scenes…" : "See my scenes"} />
        </div>
      ) : stage === "preview" && effectivePreview ? (
        <PreviewPanel
          preview={preview}
          draft={draft}
          onBack={() => setStage("setup")}
          onContinue={continueToAccount}
        />
      ) : stage === "preview" ? <PreviewUnlock onBack={() => setStage("setup")} /> : <LockedPreview stage={stage} onContinue={continueToAccount} />}
    </section>
  );
}

function PreviewUnlock({ onBack }: { onBack: () => void }) {
  return <div className="guest-panel guest-preview-unlock">
    <span className="guest-label">Step 2 · Script &amp; Characters</span>
    <h3>Build your script preview first</h3>
    <p className="guest-note">Enter a rough idea in Step 1, then choose “See my scenes” to preview the characters and scene plan here.</p>
    <button type="button" className="guest-back mt-5" onClick={onBack}>Return to Step 1</button>
  </div>;
}

function LockedPreview({ stage, onContinue }: { stage: "generate" | "edit"; onContinue: (target: "signup" | "auth") => void }) {
  const generating = stage === "generate";
  return <div className="guest-panel guest-locked-preview">
    <div className="guest-locked-screen" aria-hidden="true">
      {generating ? <><div className="guest-fake-title">Generate</div>{["Arrival", "The turn", "A new choice"].map((title) => <div className="guest-fake-scene" key={title}><span>{title}</span><i>Generate scene</i></div>)}</> : <><div className="guest-fake-title">Edit your story</div><div className="guest-fake-player" /><div className="guest-fake-timeline"><i /><i /><i /></div></>}
    </div>
    <div className="guest-lock-message">
      <Lock size={18} aria-hidden />
      <span className="guest-label">Step {generating ? "3" : "4"} · {generating ? "Generate" : "Edit & export"}</span>
      <h3>Sign up</h3>
      <p>Keep your idea, script, and characters, then generate scenes and finish your story in your account.</p>
      <div className="guest-actions"><button type="button" className="public-button public-button-lime" onClick={() => onContinue("signup")}>Sign up</button><button type="button" className="guest-back" onClick={() => onContinue("auth")}>Sign in</button></div>
    </div>
  </div>;
}

function PreviewPanel({
  preview,
  draft,
  onBack,
  onContinue,
}: {
  preview: Preview | null;
  draft: Draft;
  onBack: () => void;
  onContinue: (target: "signup" | "auth") => void;
}) {
  if (!preview) return null;
  const { state } = preview;
  return (
    <div className="guest-panel">
      <div className="guest-preview-head">
        <div>
          <span className="guest-label">Step 2 · Script &amp; Characters</span>
          <h3>{state.title}</h3>
          <p className="guest-note">{state.premise}</p>
        </div>
        <button type="button" className="guest-back" onClick={onBack}>
          <RotateCcw size={14} />
          Change my setup
        </button>
      </div>

      {preview.generationBlocked ? (
        <p className="guest-blocked" role="status">
          {preview.generationBlocked}
        </p>
      ) : null}

      {state.characters.length ? (
        <div className="guest-field">
          <span className="guest-label">Your characters</span>
          <ul className="guest-list">
            {state.characters.map((character) => (
              <li key={character.id}>
                <strong>{character.name}</strong>
                <small>{character.appearance}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="guest-field">
        <span className="guest-label">Your scenes</span>
        <ul className="guest-list">
          {state.scenes.map((scene, index) => (
            <li key={scene.id}>
              <strong>
                {index + 1}. {scene.title}
              </strong>
              <small>{scene.visualAction || scene.description}</small>
              {scene.dialogues.length ? (
                <ul className="guest-dialogue">
                  {scene.dialogues.map((line) => (
                    <li key={line.id}>
                      <em>{line.character}</em> {line.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <small className="guest-silent">
                  No dialogue — this scene plays on picture and ambience.
                </small>
              )}
            </li>
          ))}
        </ul>
        <p className="guest-note">
          Scene descriptions guide the picture and are never spoken. Only
          character dialogue is spoken aloud.
        </p>
      </div>

      <div className="guest-field">
        <span className="guest-label">What happens next</span>
        <ul className="guest-next">
          <li>
            <Check size={14} />
            Add reference images and lock each character&apos;s appearance
          </li>
          <li>
            <Check size={14} />
            Generate a {draft.clipSeconds}s clip per scene, and retry any you do
            not like
          </li>
          <li>
            <Check size={14} />
            Trim, split, reorder, add titles, and export one MP4
          </li>
        </ul>
      </div>

      <div className="guest-actions">
        <button
          type="button"
          className="public-button public-button-lime"
          onClick={() => onContinue("signup")}
        >
          Keep this and create my story
        </button>
        <button type="button" className="guest-back" onClick={() => onContinue("auth")}>
          I already have an account
        </button>
      </div>
      {preview?.generationBlocked ? <p className="guest-note" role="status">{preview.generationBlocked}</p> : null}
      <p className="guest-note">
        Your idea, setup and these scenes come with you when you sign in.
      </p>
    </div>
  );
}
