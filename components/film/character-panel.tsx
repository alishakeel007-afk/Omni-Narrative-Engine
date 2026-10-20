"use client";

import { Select } from "@/components/ui/select";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Lock, MessageSquare, Star, Trash2, Unlock, Upload } from "lucide-react";
import { FieldAssist, AssistedInput } from "./field-assist";
import { AssistPanel, useAssist, type AssistResult } from "./assist-panel";
import { URDU_VOICE_ARCHETYPES } from "@/lib/film/voices";
import type { StudioCharacter, StudioState } from "@/types/studio";

type Props = {
  projectId: string;
  characterId?: string;
  state: StudioState;
  /** Resolved server-side; the browser cannot read the deployment's limits. */
  onCharacter: (
    characterId: string,
    patch: { name: string; appearance: string; locked: boolean },
  ) => Promise<boolean>;
  onReference: (
    characterId: string,
    referenceId: string,
    operation: "primary" | "remove",
  ) => Promise<boolean>;
  /** Uploads a view and replaces state with the analysed result. */
  onUpload: (form: FormData) => Promise<string | null>;
  onVoice: (characterId: string, voice: Record<string, string> | null) => Promise<boolean>;
  onAction: (body: Record<string, unknown>) => Promise<boolean>;
};

const MAX_VIEWS = 6;
const MAX_CHARACTERS = 12;

/**
 * Characters for Step 2.
 *
 * Every write here is addressed by the character's stable id, never by its
 * name: a name is display text the user may edit or reuse, so using it as
 * identity is how one character's reference views end up attached to another.
 * The only name-addressed call left is creating a brand new character, where
 * no id exists yet.
 */
export function CharacterPanel({
  projectId,
  characterId,
  state,
  onCharacter,
  onReference,
  onUpload,
  onVoice,
  onAction,
}: Props) {
  const urdu = (state.language ?? "en") === "ur";
  const [adding, setAdding] = useState(false);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--ink)]">Characters</h3>
        <p className="text-xs leading-5 text-[var(--muted)]">
          {urdu
            ? "Urdu video and lip-sync are coming soon. You can save character drafts now."
            : "English speech is generated with each clip. Voice is not selectable in this version, and a character's voice may differ between clips."}
        </p>
      </div>

      {state.characters.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          No characters yet. Add one below, or build a script in Setup.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {state.characters.filter(character => !characterId || character.id === characterId).map((character) => (
            <CharacterCard
              key={character.id}
              projectId={projectId}
              state={state}
              character={character}
              urdu={urdu}
              onCharacter={onCharacter}
              onReference={onReference}
              onUpload={onUpload}
              onVoice={onVoice}
              onAction={onAction}
            />
          ))}
        </ul>
      )}

      {!characterId || characterId === "new" ? <>
      <form className="mt-3 flex flex-wrap gap-2" onSubmit={async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const name = String(new FormData(form).get("name") || "").trim();
        if (name && await onAction({ action: "createCharacter", name })) form.reset();
      }}>
        <input name="name" aria-label="New character name" required maxLength={100} placeholder="New character name" className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
        <button type="submit" className="guest-pill" disabled={state.characters.length >= MAX_CHARACTERS}>Add without a photo</button>
      </form>

      {adding ? (
        <AddCharacter
          onCancel={() => setAdding(false)}
          onUpload={onUpload}
          taken={state.characters.map((item) => item.name.trim().toLowerCase())}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={state.characters.length >= MAX_CHARACTERS}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          Add a character from a photo
        </button>
      )}
      </> : null}
    </section>
  );
}

function CharacterCard({
  projectId,
  state,
  character,
  urdu,
  onCharacter,
  onReference,
  onUpload,
  onVoice,
  onAction,
}: {
  projectId: string;
  state: StudioState;
  character: StudioCharacter;
  urdu: boolean;
} & Pick<Props, "onCharacter" | "onReference" | "onUpload" | "onVoice" | "onAction">) {
  const assist = useAssist(projectId);
  const [part, setPart] = useState<"identity" | "story" | "references">("identity");
  const [name, setName] = useState(character.name);
  const [appearance, setAppearance] = useState(character.appearance);
  useEffect(() => { setAppearance(character.appearance); }, [character.appearance]);
  useEffect(() => { setName(character.name); }, [character.name]);
  const [result, setResult] = useState<AssistResult | undefined>();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const portraitRequest = useRef<string | null>(null);
  const views = character.references ?? [];
  const dirty = name !== character.name || appearance !== character.appearance;
  const changeReference = async (referenceId: string, operation: "primary" | "remove") => {
    setBusy(`reference:${referenceId}`); setError("");
    try { if (!await onReference(character.id, referenceId, operation)) throw new Error("The reference change was not saved. Please try again."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The reference could not be changed."); }
    finally { setBusy(""); }
  };

  const save = async (locked: boolean) => {
    setBusy(locked ? "lock" : "save");
    setError("");
    const ok = await onCharacter(character.id, { name, appearance, locked });
    if (!ok) setError("That change was not saved.");
    setBusy("");
  };

  const upload = async (chosen: File, label: string) => {
    setBusy("upload");
    setError("");
    const form = new FormData();
    form.set("file", chosen);
    // Addressed by id so a rename, or two characters sharing a name, cannot
    // attach this view to the wrong person.
    form.set("characterId", character.id);
    form.set("name", character.name);
    form.set("view", label);
    const problem = await onUpload(form);
    if (problem) setError(problem);
    setBusy("");
  };

  const context = {
    field: "characterAppearance",
    language: state.language ?? "en",
    assist: state.assist ?? "guided",
    depends: `${character.id}:${character.name}`,
  } as const;

  return (
    <li className="rounded-2xl border border-[var(--line)] p-4">
      {busy ? <p role="status" aria-live="polite" className="film-action-feedback"><Loader2 size={14} className="animate-spin" aria-hidden />{busy.startsWith("reference:") ? "Updating reference…" : "Working…"}</p> : null}
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Character details">
        {([ ["identity", "1. Identity"], ["story", "2. Their story"], ["references", "3. Approve a reference"] ] as const).map(([id, label]) => <button type="button" key={id} className={`guest-pill ${part === id ? "active" : ""}`} aria-pressed={part === id} onClick={async () => { if (dirty && !character.locked) { if (appearance.trim().length < 10 || !name.trim()) { setError("Save a name and appearance before leaving Identity."); return; } if (!await onCharacter(character.id, { name, appearance, locked: false })) return; } setPart(id); }}>{label}</button>)}
      </div>
      <div hidden={part !== "identity"}>
      <div className="flex flex-wrap items-start gap-3">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Character name"
          className="min-w-40 flex-1 border-b border-[var(--line)] bg-transparent pb-1 text-base font-semibold text-[var(--ink)] outline-none focus:border-[var(--ink)]"
        />
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)]">
          {character.locked ? (
            <>
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Locked
            </>
          ) : (
            <>
              <Unlock className="h-3.5 w-3.5" aria-hidden />
              Not locked
            </>
          )}
        </span>
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-medium text-[var(--ink)]">Appearance</span>
        <span className="ml-2 text-xs text-[var(--muted)]">
          Face, hair, build and distinctive details. Choose scene outfits in Set the scene.
        </span>
        <textarea
          value={appearance}
          onChange={(event) => {
            setAppearance(event.target.value);
            assist.cancel();
          }}
          rows={3}
          disabled={character.locked}
          className="mt-1.5 w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--ink)] disabled:opacity-60"
        />
      </label>

      {!character.locked ? <FieldAssist projectId={projectId} state={state} field="characterName" characterId={character.id} label="suggest a name" value={name} onAccept={setName} /> : null}
      </div>
      <div hidden={part !== "story"}><p className="film-help mb-3">What drives this person, and how do they relate to the others?</p>
        {(["motivation", "relationships"] as const).map(field => <div className="mb-5" key={field}>
          <AssistedInput projectId={projectId} state={state} field={field} characterId={character.id} label={`suggest ${field}`}
            inputLabel={field === "motivation" ? "Motivation" : "Relationships"} rows={2} value={character[field] ?? ""}
            onSave={answer => onAction({ action: "character", characterId: character.id, name: character.name, appearance: character.appearance, locked: character.locked, [field]: answer })} />
        </div>)}
      </div>

      <div hidden={part !== "references"}>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className="guest-pill" disabled={Boolean(busy) || appearance.trim().length < 10 || dirty}
          onClick={async () => { setBusy("portrait"); portraitRequest.current ??= crypto.randomUUID();
            if (await onAction({ action: "generatePortrait", characterId: character.id, requestId: portraitRequest.current })) portraitRequest.current = null;
            setBusy(""); }}>
          Generate concept portrait
        </button>
        <button type="button" className="film-text-button" onClick={() => {
          if (window.confirm("Remove this character? You must first remove them from scene casts and dialogue. Undo script change restores the character and references."))
            void onAction({ action: "removeCharacter", characterId: character.id });
        }}>Remove character</button>
      </div>
      <p className="film-help">Portrait generation uses provider credits. Save the appearance first, then approve a result as a reference and lock the reviewed identity.</p>
      {state.messages.filter(message => message.portraitCharacterId === character.id).map(message => <div key={message.id} className="mt-3">
        {message.imageError || message.image?.error ? <p role="alert" className="film-help">{message.imageError || message.image?.error}</p> : null}
        {message.image?.status === "complete" && message.image.url ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={message.image.url} alt={`Concept portrait of ${character.name}`} className="h-40 w-40 rounded-lg object-cover" />
          <button type="button" className="guest-pill mt-2" disabled={Boolean(busy) || views.length >= MAX_VIEWS} onClick={async () => {
            setBusy("approve"); setError("");
            try {
              const response = await fetch(message.image!.url!);
              if (!response.ok) throw new Error("The portrait could not be loaded.");
              const blob = await response.blob();
              const form = new FormData();
              form.set("file", new File([blob], "approved-portrait.png", { type: blob.type || "image/png" }));
              form.set("characterId", character.id);
              form.set("name", character.name);
              form.set("view", "Approved generated portrait");
              form.set("skipAnalysis", "true");
              const problem = await onUpload(form);
              if (problem) throw new Error(problem);
            } catch (cause) { setError(cause instanceof Error ? cause.message : "The portrait could not be approved."); }
            setBusy("");
          }}>Approve and use as reference</button>
        </> : message.image && ["queued", "rendering"].includes(message.image.status) ?
          <button type="button" className="guest-pill" onClick={() => void onAction({ action: "poll" })}>Check portrait status</button> : null}
      </div>)}

      </div>
      <div hidden={part !== "identity"}>
      {character.locked ? (
        <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
          Locked so generation keeps this appearance. Unlock to edit it — every
          scene this character appears in will need regenerating.
        </p>
      ) : (
        <>
          <FieldAssist projectId={projectId} state={state} field="characterAppearance" characterId={character.id} label={`describe ${name || "this character"}`} value={appearance} onAccept={setAppearance} />
        </>
      )}

      </div>
      <div hidden={part !== "references"}>
      <div className="mt-4">
        <span className="text-xs font-medium text-[var(--ink)]">
          Reference views ({views.length}/{MAX_VIEWS})
        </span>
        {views.length === 0 ? (
          <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
            No reference views. Generation needs at least one, and the
            appearance above is written from them.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {views.map((view) => {
              const primary = character.referenceId === view.id;
              return (
                <li key={view.id} className="w-28">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/studio/${projectId}/reference?referenceId=${encodeURIComponent(view.id)}`}
                    alt={`${character.name}: ${view.label}`}
                    className="h-28 w-28 rounded-xl border border-[var(--line)] object-cover"
                  />
                  <span className="mt-1 block truncate text-xs text-[var(--muted)]">
                    {view.label}
                  </span>
                  <div className="mt-1 flex gap-1">
                    <button
                      type="button"
                      disabled={primary || !!busy}
                      aria-label={primary ? "Primary view" : "Make primary"}
                      aria-pressed={primary}
                      data-selection-box
                      onClick={() => void changeReference(view.id, "primary")}
                      className="rounded-full border border-[var(--line)] p-1 text-[var(--ink)] transition hover:bg-black/[0.04] disabled:bg-[var(--accent)] disabled:opacity-100"
                    >
                      <Star className="h-3 w-3" aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove view"
                      disabled={!!busy}
                      onClick={() => {
                        if (window.confirm("Remove this reference view? The character will be unlocked and affected scenes will need review. Existing takes and timeline edits stay saved."))
                          void changeReference(view.id, "remove");
                      }}
                      className="rounded-full border border-[var(--line)] p-1 text-[var(--ink)] transition hover:bg-black/[0.04]"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            event.target.value = "";
            if (chosen) void upload(chosen, views.length ? "Additional view" : "Primary");
          }}
        />
        <button
          type="button"
          disabled={views.length >= MAX_VIEWS || busy === "upload"}
          onClick={() => file.current?.click()}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-50"
        >
          {busy === "upload" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-3.5 w-3.5" aria-hidden />
          )}
          {busy === "upload" ? "Reading the photo…" : "Add a view"}
        </button>
        {busy === "upload" ? (
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            Every view is re-read together, so the appearance below may change.
            Review it before locking.
          </p>
        ) : null}
      </div>

      </div>
      {urdu ? (
        <label className="mt-4 block">
          <span className="text-xs font-medium text-[var(--ink)]">Voice</span>
          <Select aria-label="Voice"
            disabled
            title="Urdu video generation and lip-sync are coming soon. Existing voice settings are preserved."
            value={character.voice?.archetype ?? ""}
            onChange={(event) => {
              const option = URDU_VOICE_ARCHETYPES.find(
                (item) => item.archetype === event.target.value,
              );
              void onVoice(character.id, option ? { ...option } : null);
            }}
            className="mt-1.5 block rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink)]"
          >
            <option value="">No voice yet</option>
            {URDU_VOICE_ARCHETYPES.map((option) => (
              <option key={option.archetype} value={option.archetype}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      ) : null}

      {assist.error ? <p role="alert" className="mt-3 text-sm">{assist.error}</p> : null}
      {error ? (
        <p role="alert" className="mt-3 text-xs font-medium text-[var(--ink)]">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!dirty || busy !== "" || character.locked}
          onClick={() => void save(character.locked)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-50"
          hidden={part !== "identity"}
        >
          {busy === "save" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden />
          )}
          Save identity
        </button>
        {character.locked ? (
          <button
            type="button"
            disabled={busy !== ""}
            onClick={() => void save(false)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-50"
          >
            <Unlock className="h-3.5 w-3.5" aria-hidden />
            Unlock to edit
          </button>
        ) : (
          <button
            type="button"
            disabled={busy !== "" || views.length === 0}
            onClick={() => void save(true)}
            title={views.length === 0 ? "Add a reference view first" : undefined}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:opacity-90 disabled:opacity-50"
          >
            {busy === "lock" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Lock className="h-3.5 w-3.5" aria-hidden />
            )}
            Looks right — lock it
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * Creating a character.
 *
 * This is the one place a name is the address, because the character does not
 * exist yet and has no id. The name is checked against the ones already in the
 * project first, so an upload cannot merge into an existing character by
 * accident.
 */
function AddCharacter({
  taken,
  onUpload,
  onCancel,
}: {
  taken: string[];
  onUpload: Props["onUpload"];
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const clash = taken.includes(name.trim().toLowerCase());

  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] p-4">
      <label className="block">
        <span className="text-xs font-medium text-[var(--ink)]">Name <span className="font-normal text-[var(--muted)]">Optional</span></span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name them now, or later"
          className="mt-1.5 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--ink)]"
        />
      </label>
      {clash ? (
        <p className="mt-1.5 text-xs font-medium text-[var(--ink)]">
          {name.trim()} is already in this project. Use a different name, or add
          a view to the existing character instead.
        </p>
      ) : null}
      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          if (!chosen) return;
          void (async () => {
            setBusy(true);
            setError("");
            const form = new FormData();
            form.set("file", chosen);
            form.set("name", name.trim());
            form.set("view", "Primary");
            form.set("createCharacter", "true");
            const problem = await onUpload(form);
            setBusy(false);
            if (problem) setError(problem);
            else onCancel();
          })();
        }}
      />
      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-[var(--ink)]">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={clash || busy}
          onClick={() => file.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-3.5 w-3.5" aria-hidden />
          )}
          {busy ? "Omni is reading the photo…" : "Choose a photo"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-[var(--line)] px-4 py-2 text-xs font-medium text-[var(--ink)] transition hover:bg-black/[0.04]"
        >
          Cancel
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
        Upload a photo alone and Omni will extract an editable appearance. Add
        a name now or after reviewing it. The photo does not clone a voice,
        and a likeness is never guaranteed.
      </p>
    </div>
  );
}
