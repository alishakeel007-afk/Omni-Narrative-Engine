"use client";

import { useEffect, useState } from "react";
import { Plus, Scissors, MessageSquare, Trash2 } from "lucide-react";
import { CharacterPanel } from "./character-panel";
import { DecisionFlow, type DecisionPage } from "./decision-flow";
import { FieldAssist, AssistedInput } from "./field-assist";
import { sceneDecisionPages } from "./creative-decisions";
import { dialogueFit, sceneSpeechFit, speechBudgetSeconds } from "@/lib/film/dialogue";
import type { ClipCapability } from "@/lib/film/duration";
import { MAX_BEATS } from "@/lib/film/shots";
import type { FilmBeat, StudioScene, StudioState } from "@/types/studio";

type Props = {
  projectId: string;
  state: StudioState;
  capability?: ClipCapability;
  onScenePatch: (sceneId: string, patch: Record<string, unknown>) => Promise<boolean>;
  onDialogue: (sceneId: string, operation: Record<string, unknown>) => Promise<boolean>;
  onBeats: (sceneId: string, beats: FilmBeat[] | null) => Promise<boolean>;
  onVoice: (characterId: string, voice: Record<string, string> | null) => Promise<boolean>;
  onCharacter: (
    characterId: string,
    patch: { name: string; appearance: string; locked: boolean },
  ) => Promise<boolean>;
  onReference: (
    characterId: string,
    referenceId: string,
    operation: "primary" | "remove",
  ) => Promise<boolean>;
  onUpload: (form: FormData) => Promise<string | null>;
  onAction: (body: Record<string, unknown>) => Promise<boolean>;
  onContinue: () => void;
  /** "Let Omni do it": fills empty scene details, then opens Generate. */
  onAutoDirect: () => Promise<boolean>;
  /** "I'll direct": the writer walks the scene pages themselves. */
  onDirect: () => Promise<boolean>;
  directing: boolean;
};

/** The clip length a scene will actually be generated at. */
function sceneSeconds(scene: StudioScene, state: StudioState, capability?: ClipCapability) {
  return scene.requestedSeconds ?? state.clipSeconds ?? capability?.options[0] ?? 5;
}

export function ScriptStep({
  projectId,
  state,
  capability,
  onScenePatch,
  onDialogue,
  onBeats,
  onVoice,
  onCharacter,
  onReference,
  onUpload,
  onAction,
  onContinue,
  onAutoDirect,
  onDirect,
  directing,
}: Props) {
  const mode = state.directionMode;
  const pages: DecisionPage[] = [
    { id: "who-directs", title: "Who decides the details?", description: "Location, lighting, camera, background people, expressions, wardrobe and sound for every scene. Let Omni fill them in from your story, or set each one yourself. Anything you have already written is always kept.",
      content: <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" className={`decision-choice ${mode === "omni" ? "active" : ""}`} aria-pressed={mode === "omni"} disabled={directing || !state.scenes.length} onClick={() => void onAutoDirect()}>
          <strong>{directing ? "Omni is directing your scenes…" : "Let Omni do it"}</strong>
          <span>Omni fills every empty detail, then takes you to Generate. You can still review and change anything here.</span>
        </button>
        <button type="button" className={`decision-choice ${mode === "director" ? "active" : ""}`} aria-pressed={mode === "director"} disabled={directing} onClick={() => void onDirect()}>
          <strong>I&apos;ll direct</strong>
          <span>Go through each scene step by step. Ask Omni on any field when you want a suggestion.</span>
        </button>
      </div> },
    { id: "order", title: "Arrange your scenes", description: "Start with the story order. We’ll review each character and scene next.", content: <>
      <ol className="story-scene-list">{state.scenes.map((scene, index) => <li key={scene.id}>
        <span className="story-scene-index">{index + 1}</span><span className="min-w-0 flex-1"><strong>{scene.title}</strong><small>{(scene.visualAction ?? scene.description).slice(0, 110)}</small></span>
        <div className="flex gap-2"><button type="button" className="film-text-button" aria-label={`Move scene ${index + 1} up`} disabled={!index} onClick={() => void onAction({ action: "sceneList", operation: "move", sceneId: scene.id, toIndex: index - 1 })}>Up</button>
        <button type="button" className="film-text-button" aria-label={`Move scene ${index + 1} down`} disabled={index === state.scenes.length - 1} onClick={() => void onAction({ action: "sceneList", operation: "move", sceneId: scene.id, toIndex: index + 1 })}>Down</button>
        <button type="button" className="film-text-button" aria-label={`Remove scene ${index + 1}`} onClick={() => { if (window.confirm("Remove this scene? Its takes and timeline edits are preserved.")) void onAction({ action: "sceneList", operation: "remove", sceneId: scene.id }); }}>Remove</button></div>
      </li>)}</ol><div className="mt-4 flex gap-3"><button type="button" className="guest-pill" onClick={() => void onAction({ action: "sceneList", operation: "add" })}>Add scene</button>
      {state.scriptUndo ? <button type="button" className="film-text-button" onClick={() => void onAction({ action: "undoScript" })}>Undo script change</button> : null}</div>
      {!state.scenes.length ? <p className="film-help">Add a scene or return to Setup to build a script.</p> : null}
    </> },
    ...state.characters.map(character => ({ id: `character:${character.id}`, title: `Meet ${character.name}`, description: "Review one person at a time. Their identity stays separate from each scene’s wardrobe.", content:
      <CharacterPanel projectId={projectId} state={state} characterId={character.id} onCharacter={onCharacter} onReference={onReference} onUpload={onUpload} onVoice={onVoice} onAction={onAction} /> })),
    { id: "add-character", title: "Anyone else in your story?", description: "Add a character only if your story needs one. You can skip this.", optional: true, content:
      <CharacterPanel projectId={projectId} state={state} characterId="new" onCharacter={onCharacter} onReference={onReference} onUpload={onUpload} onVoice={onVoice} onAction={onAction} /> },
    ...state.scenes.flatMap((scene, index) => [
      ...([ ["action", "What happens?"], ["cast", "Who is here?"], ["dialogue", "What do they say?"] ] as const).map(([part, label]) => ({ id: `${scene.id}:${part}`, title: `Scene ${index + 1} · ${label}`, content:
        <SceneCard key={`${scene.id}:${part}`} projectId={projectId} state={state} capability={capability} scene={scene} index={index} part={part} onScenePatch={onScenePatch} onDialogue={onDialogue} onBeats={onBeats} /> })),
      ...sceneDecisionPages({ projectId, scene, state, onSave: patch => onScenePatch(scene.id, patch) }),
      { id: `${scene.id}:shots`, title: `Scene ${index + 1} · Camera cuts`, optional: true, content:
        <SceneCard key={`${scene.id}:shots`} projectId={projectId} state={state} capability={capability} scene={scene} index={index} part="shots" onScenePatch={onScenePatch} onDialogue={onDialogue} onBeats={onBeats} /> },
    ]),
    { id: "ready", title: "Your script is ready to review", description: "Generation uses these saved scenes and approved character references.", content: <ul className="story-scene-list">{state.scenes.map((scene, index) => <li key={scene.id}><span className="story-scene-index">{index + 1}</span><div><strong>{scene.title}</strong><small>{scene.dialogues.length} dialogue lines · {scene.characterIds.length} characters</small></div></li>)}</ul> },
  ];
  return <DecisionFlow storageKey={`story:${projectId}:script`} pages={pages} finish={onContinue} finishLabel="Continue to video" />;
}

function SceneCard({
  projectId,
  state,
  capability,
  scene,
  index,
  part,
  onScenePatch,
  onDialogue,
  onBeats,
}: {
  projectId: string;
  state: StudioState;
  capability?: ClipCapability;
  scene: StudioScene;
  index: number;
  part: "action" | "cast" | "dialogue" | "shots";
  onScenePatch: Props["onScenePatch"];
  onDialogue: Props["onDialogue"];
  onBeats: Props["onBeats"];
}) {
  const language = state.language ?? "en";
  const rtl = language === "ur";
  const [title, setTitle] = useState(scene.title);
  useEffect(() => setTitle(scene.title), [scene.title]);
  const [visualAction, setVisualAction] = useState(scene.visualAction ?? scene.description ?? "");
  useEffect(() => { setVisualAction(scene.visualAction ?? scene.description ?? ""); }, [scene.visualAction, scene.description]);
  const [adding, setAdding] = useState(false);

  const seconds = sceneSeconds(scene, state, capability);
  const fit = sceneSpeechFit(scene, language, seconds);
  const beats = scene.beats ?? [];

  const cast = state.characters.filter((character) => scene.characterIds.includes(character.id));
  const speakers = cast.length ? cast : state.characters;
  // Urdu lip-sync drives one mouth from one supplied track, so a clip holds a
  // single turn. English speech is generated inside the clip and can carry
  // several speakers across its cuts.
  const oneTurnOnly = language === "ur";

  return (
    <div className="rounded-2xl border border-[var(--line)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Scene {index + 1} · one {seconds.toFixed(1)}s video
          {beats.length > 1 ? ` · ${beats.length} shots` : ""}
        </span>
        {scene.outdated ? (
          <span className="text-xs font-medium text-[var(--ink)]">Needs review</span>
        ) : null}
      </div>

      {part === "action" ? <>
      <input
        value={title}
        onChange={event => setTitle(event.target.value)}
        onBlur={() => { if (title !== scene.title) void onScenePatch(scene.id, { title }); }}
        dir={rtl ? "rtl" : "ltr"}
        aria-label="Scene title"
        className="mt-1 w-full border-none bg-transparent text-lg font-semibold text-[var(--ink)] outline-none"
      />

      <label className="mt-4 block">
        <span className="text-xs font-medium text-[var(--ink)]">Visual action</span>
        <span className="ml-2 text-xs text-[var(--muted)]">
          Guides the picture — never spoken aloud
        </span>
        <textarea
          aria-label="Visual action"
          value={visualAction}
          onChange={(event) => {
            setVisualAction(event.target.value);
          }}
          onBlur={() => { if (visualAction !== (scene.visualAction ?? scene.description)) void onScenePatch(scene.id, { visualAction }); }}
          rows={3}
          dir={rtl ? "rtl" : "ltr"}
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--ink)]"
        />
      </label>
      <FieldAssist projectId={projectId} state={state} sceneId={scene.id} field="sceneTitle" label="name this scene" value={title} onAccept={title => onScenePatch(scene.id, { title })} />
      <FieldAssist projectId={projectId} state={state} sceneId={scene.id} field="visualAction" label="describe the action" value={visualAction} onAccept={answer => { setVisualAction(answer); return onScenePatch(scene.id, { visualAction: answer }); }} />
      </> : null}
      {part === "cast" ? <>
      <fieldset className="mt-4"><legend className="text-xs font-medium">Cast in this scene</legend>
        <p className="film-help">Each person shown needs an approved reference and a locked identity before generation. Remove or reassign their dialogue before removing them from the cast.</p>
        <div className="mt-2 flex flex-wrap gap-3">{state.characters.map(character => <label key={character.id} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={scene.characterIds.includes(character.id)}
            onChange={event => void onScenePatch(scene.id, { characterIds: event.target.checked ? [...scene.characterIds, character.id] : scene.characterIds.filter(id => id !== character.id) })} />
          {character.name}
        </label>)}</div>
        {!state.characters.length ? <p className="film-help">No cast is needed for a landscape or other scene without people. Add characters above when the scene needs them.</p> : null}
      </fieldset>

      {capability ? (
        <label className="mt-4 block">
          <span className="text-xs font-medium text-[var(--ink)]">This scene&apos;s length</span>
          <select
            value={scene.requestedSeconds ?? ""}
            onChange={(event) =>
              void onScenePatch(scene.id, {
                requestedSeconds: event.target.value ? Number(event.target.value) : null,
              })
            }
            className="mt-1.5 block rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink)]"
          >
            <option value="">
              Use the project default ({(state.clipSeconds ?? capability.options[0]).toFixed(1)}s)
            </option>
            {capability.choices.map((option) => (
              <option key={option.seconds} value={option.seconds} disabled={!option.available}>
                {option.seconds}s{option.available ? "" : " — coming soon"}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      </> : null}
      {part === "dialogue" ? <div className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-[var(--ink)]">Dialogue</span>
          {fit.lines > 0 ? (
            <span className="text-xs text-[var(--muted)]">
              about {fit.estimatedSeconds.toFixed(1)}s of {speechBudgetSeconds(seconds).toFixed(1)}s
              available (estimated)
            </span>
          ) : null}
        </div>

        {fit.overBudget ? (
          <p className="mt-1.5 text-xs font-medium leading-5 text-[var(--ink)]">
            This is more dialogue than a {seconds.toFixed(1)}s clip can hold.
            Shorten a line, split the scene, or raise this scene&apos;s length.
          </p>
        ) : null}
        {oneTurnOnly && fit.lines > 1 ? (
          <p className="mt-1.5 text-xs font-medium leading-5 text-[var(--ink)]">
            Urdu clips are lip-synced from one speech track, so a clip carries a
            single line. Move the reply into its own scene.
          </p>
        ) : null}

        {scene.dialogues.length === 0 ? (
          <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
            No dialogue here. That is fine — it will be generated as a silent
            shot with ambience and no speech of any kind.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {scene.dialogues.map((line, lineIndex) => {
              // On the Urdu path one line owns the whole speech budget; on the
              // English path the lines share it.
              const share = oneTurnOnly
                ? speechBudgetSeconds(seconds)
                : speechBudgetSeconds(seconds) / Math.max(1, scene.dialogues.length);
              const lineFit = dialogueFit(line.text, language, share);
              return (
                <li key={line.id} className="rounded-xl border border-[var(--line)] p-3">
                  <div className="flex items-center gap-2">
                    <select
                      defaultValue={line.character}
                      aria-label="Speaker"
                      onChange={(event) =>
                        void onDialogue(scene.id, {
                          kind: "update",
                          dialogueId: line.id,
                          character: event.target.value,
                        })
                      }
                      className="rounded-lg border border-[var(--line)] px-2 py-1.5 text-xs font-semibold text-[var(--ink)] outline-none"
                    >
                      {[line.character, ...speakers.map((item) => item.name)]
                        .filter((name, position, all) => all.indexOf(name) === position)
                        .map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                    </select>
                    <span className="flex-1" />
                    {([-1, 1] as const).map(delta => <button type="button" key={delta}
                      aria-label={delta < 0 ? "Move dialogue up" : "Move dialogue down"}
                      disabled={lineIndex + delta < 0 || lineIndex + delta >= scene.dialogues.length}
                      className="film-text-button" onClick={() => {
                        const ids = scene.dialogues.map(item => item.id as string);
                        [ids[lineIndex], ids[lineIndex + delta]] = [ids[lineIndex + delta], ids[lineIndex]];
                        void onDialogue(scene.id, { kind: "reorder", dialogueIds: ids });
                      }}>{delta < 0 ? "Up" : "Down"}</button>)}
                    <button
                      type="button"
                      aria-label="Delete line"
                      onClick={() => void onDialogue(scene.id, { kind: "remove", dialogueId: line.id })}
                      className="rounded-full border border-[var(--line)] p-1.5 text-[var(--ink)] transition hover:bg-black/[0.04]"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                  <AssistedInput projectId={projectId} state={state} sceneId={scene.id} dialogueId={line.id} field="dialogue"
                    label={`rewrite ${line.character}’s line`} inputLabel={`${line.character}’s dialogue`} value={line.text} rows={2}
                    onSave={text => onDialogue(scene.id, { kind: "update", dialogueId: line.id, text })} />
                  <p className="mt-1.5 text-xs text-[var(--muted)]">
                    {lineFit.words} words · about {lineFit.estimatedSeconds.toFixed(1)}s
                    (estimated)
                    {lineFit.overBudget ? (
                      <span className="ml-1 font-medium text-[var(--ink)]">
                        — longer than the {lineFit.limitSeconds.toFixed(1)}s this
                        line has. Shorten or split it.
                      </span>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {adding ? (
          <AddLine
            projectId={projectId} state={state} scene={scene}
            speakers={speakers.map((item) => item.name)}
            onCancel={() => setAdding(false)}
            onAdd={async (character, text) => {
              const ok = await onDialogue(scene.id, { kind: "add", character, text });
              if (ok) setAdding(false);
              return ok;
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={!speakers.length || scene.dialogues.length >= 12}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add a line
          </button>
        )}
      </div> : null}

      {part !== "shots" || oneTurnOnly ? null : (
        <ShotSequence projectId={projectId} state={state} scene={scene} rtl={rtl} onBeats={onBeats} />
      )}
    </div>
  );
}

/**
 * Optional cuts inside the scene's single video.
 *
 * This does not create more videos. One generation still produces one source
 * file; the cuts live inside it, and Step 4 can split that file at them.
 */
function ShotSequence({
  projectId,
  state,
  scene,
  rtl,
  onBeats,
}: {
  projectId: string;
  state: StudioState;
  scene: StudioScene;
  rtl: boolean;
  onBeats: Props["onBeats"];
}) {
  const beats = scene.beats ?? [];
  const [error, setError] = useState("");

  const write = async (next: FilmBeat[] | null) => {
    setError("");
    const ok = await onBeats(scene.id, next);
    if (!ok) setError("Those shots were not saved.");
    return ok;
  };

  const start = () => {
    // Every line must belong to exactly one shot, so the first split puts them
    // all in shot one and the writer moves them from there.
    void write([
      {
        id: `${scene.id}-beat-1`,
        visualAction: scene.visualAction ?? scene.description ?? "",
        dialogueIds: scene.dialogues.map((line) => line.id).filter((id): id is string => Boolean(id)),
      },
      { id: `${scene.id}-beat-2`, visualAction: `Cut closer within the same scene: ${scene.visualAction ?? scene.description}`, dialogueIds: [] },
    ]);
  };

  if (!beats.length) {
    return (
      <div className="mt-5 border-t border-[var(--line)] pt-4">
        <p className="text-xs leading-5 text-[var(--muted)]">
          This scene is one continuous shot. You can cut it into a short
          sequence instead — still one generated video, which you can split in
          the editor afterwards.
        </p>
        <button
          type="button"
          onClick={start}
          disabled={!(scene.visualAction ?? scene.description).trim()}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:bg-black/[0.04]"
        >
          <Scissors className="h-3.5 w-3.5" aria-hidden />
          Cut into shots
        </button>
      </div>
    );
  }

  const assigned = new Set(beats.flatMap((beat) => beat.dialogueIds ?? []));

  return (
    <div className="mt-5 border-t border-[var(--line)] pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-[var(--ink)]">
          Shots inside this one video
        </span>
        <button
          type="button"
          onClick={() => void write(null)}
          className="text-xs font-medium text-[var(--muted)] transition hover:text-[var(--ink)]"
        >
          Back to one continuous shot
        </button>
      </div>

      <ol className="mt-2 space-y-2">
        {beats.map((beat, position) => (
          <li key={beat.id} className="rounded-xl border border-[var(--line)] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Shot {position + 1}
              </span>
              <button
                type="button"
                aria-label="Remove shot"
                disabled={beats.length <= 2}
                onClick={() => {
                  // Its lines move to the previous shot so none is orphaned.
                  const target = position === 0 ? 1 : position - 1;
                  const next = beats
                    .map((item, itemIndex) =>
                      itemIndex === target
                        ? {
                            ...item,
                            dialogueIds: [
                              ...(item.dialogueIds ?? []),
                              ...(beat.dialogueIds ?? []),
                            ],
                          }
                        : item,
                    )
                    .filter((_, itemIndex) => itemIndex !== position);
                  void write(next.length > 1 ? next : null);
                }}
                className="rounded-full border border-[var(--line)] p-1.5 text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <textarea
              key={beat.visualAction}
              defaultValue={beat.visualAction}
              placeholder="What the camera sees in this shot"
              onBlur={(event) =>
                void write(
                  beats.map((item) =>
                    item.id === beat.id ? { ...item, visualAction: event.target.value } : item,
                  ),
                )
              }
              rows={2}
              dir={rtl ? "rtl" : "ltr"}
              className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--ink)]"
            />
            <FieldAssist projectId={projectId} state={state} sceneId={scene.id} field="visualAction" label={`describe shot ${position + 1}`} value={beat.visualAction}
              onAccept={visualAction => write(beats.map(item => item.id === beat.id ? { ...item, visualAction } : item))} />
            {scene.dialogues.length ? (
              <fieldset className="mt-2">
                <legend className="text-xs text-[var(--muted)]">Lines spoken here</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {scene.dialogues.map((line) => {
                    const mine = (beat.dialogueIds ?? []).includes(line.id!);
                    const elsewhere = !mine && assigned.has(line.id!);
                    return (
                      <label
                        key={line.id}
                        className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                          mine
                            ? "border-[var(--accent)] bg-[var(--accent)]"
                            : "border-[var(--line)]"
                        } ${elsewhere ? "opacity-50" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={mine}
                          disabled={elsewhere}
                          onChange={() =>
                            void write(
                              beats.map((item) =>
                                item.id === beat.id
                                  ? {
                                      ...item,
                                      dialogueIds: mine
                                        ? (item.dialogueIds ?? []).filter((id) => id !== line.id)
                                        : [...(item.dialogueIds ?? []), line.id!],
                                    }
                                  : item,
                              ),
                            )
                          }
                          className="h-3 w-3 accent-[var(--ink)]"
                        />
                        <span className="truncate text-[var(--ink)]">
                          {line.character}: {line.text.slice(0, 40) || "(empty)"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}
          </li>
        ))}
      </ol>

      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-[var(--ink)]">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={beats.length >= MAX_BEATS}
        onClick={() =>
          void write([
            ...beats,
            { id: `${scene.id}-beat-${beats.length + 1}-${Date.now()}`, visualAction: `Continue from a different angle: ${scene.visualAction ?? scene.description}`, dialogueIds: [] },
          ])
        }
        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        Add a shot
      </button>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
        One generation, one video. Every line has to belong to exactly one shot,
        and the soundtrack carries unbroken across the cuts.
      </p>
    </div>
  );
}

function AddLine({
  projectId,
  state,
  scene,
  speakers,
  onAdd,
  onCancel,
}: {
  projectId: string;
  state: StudioState;
  scene: StudioScene;
  speakers: string[];
  onAdd: (character: string, text: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [character, setCharacter] = useState(speakers[0] ?? "");
  const [text, setText] = useState("");
  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] p-3">
      <select
        value={character}
        onChange={(event) => setCharacter(event.target.value)}
        aria-label="Speaker"
        className="rounded-lg border border-[var(--line)] px-2 py-1.5 text-xs font-semibold text-[var(--ink)] outline-none"
      >
        {speakers.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        placeholder="What do they say?"
        className="mt-2 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--ink)]"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={!character || !text.trim()}
          onClick={() => void onAdd(character, text)}
          className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-[var(--line)] px-4 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:bg-black/[0.04]"
        >
          Cancel
        </button>
      </div>
      <FieldAssist projectId={projectId} state={state} sceneId={scene.id} characterId={state.characters.find(item => item.name === character)?.id}
        field="dialogue" label={`write ${character}’s line`} value={text} onAccept={setText} />
    </div>
  );
}
