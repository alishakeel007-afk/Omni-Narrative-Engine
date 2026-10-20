"use client";

import { useEffect, useRef, useState } from "react";
import { CHARACTER_DETAIL_FIELDS, normalizedCharacterDetails } from "@/lib/film/character-details";
import type { CharacterDetails, StudioCharacter } from "@/types/studio";
import { Select } from "@/components/ui/select";

export function CharacterDetailsEditor({ character, onSave }: { character: StudioCharacter; onSave: (details: CharacterDetails) => Promise<boolean> }) {
  const [draft, setDraft] = useState<CharacterDetails>(character.details ?? {});
  const latest = useRef(draft);
  latest.current = draft;
  const saved = useRef(JSON.stringify(normalizedCharacterDetails(character.details)));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const incoming = JSON.stringify(normalizedCharacterDetails(character.details));
  useEffect(() => {
    const previous = saved.current;
    setDraft(current => JSON.stringify(normalizedCharacterDetails(current)) === previous ? JSON.parse(incoming) : current);
    saved.current = incoming;
  }, [incoming]);
  const dirty = JSON.stringify(normalizedCharacterDetails(draft)) !== incoming;
  return <details className="mt-4" open={!character.appearance.trim() || !!Object.keys(character.details ?? {}).length}>
    <summary className="film-text-button cursor-pointer">Character details (optional)</summary>
    <p className="film-help mt-2">Choose the details that matter. Your choices guide images and videos; a name does not determine nationality, religion or dress. Leave fields unspecified for story-based creative choices.</p>
    <fieldset className="mt-3 grid gap-3 sm:grid-cols-2" disabled={character.locked}>
      <legend className="sr-only">Character identity and cultural details</legend>
      {CHARACTER_DETAIL_FIELDS.map(field => <DetailField key={field.key} label={field.label} choices={field.choices} value={draft[field.key] ?? ""}
        onChange={value => { setDraft(current => ({ ...current, [field.key]: value })); setMessage(""); }} />)}
      <label className="text-sm sm:col-span-2">Clothing preferences
        <textarea aria-label="Clothing preferences" className="decision-input mt-1" rows={2} maxLength={1000} value={draft.clothing ?? ""}
          placeholder="For example: blue cotton kurta, straight trousers, no headscarf. Scene outfits can override this."
          onChange={event => { setDraft(current => ({ ...current, clothing: event.target.value })); setMessage(""); }} />
      </label>
    </fieldset>
    {character.locked ? <p className="film-help">Unlock the identity before changing these details.</p> : <button type="button" className="guest-pill mt-3" disabled={!dirty || pending} onClick={async () => {
      const submitted = normalizedCharacterDetails(draft);
      setPending(true); setError(""); setMessage("");
      try { if (!await onSave(submitted)) throw new Error("These character details could not be saved. Please retry."); setMessage(JSON.stringify(normalizedCharacterDetails(latest.current)) === JSON.stringify(submitted) ? "Character details saved. Images and videos will follow these choices." : "Earlier details saved. Save again to apply your latest changes."); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "These character details could not be saved."); }
      finally { setPending(false); }
    }}>{pending ? "Saving details…" : "Save character details"}</button>}
    {error ? <p role="alert" className="film-action-error">{error}</p> : message ? <p role="status" className="film-action-feedback">{message}</p> : null}
  </details>;
}

function DetailField({ label, choices, value, onChange }: { label: string; choices: readonly string[]; value: string; onChange: (value: string) => void }) {
  const [custom, setCustom] = useState(!!value && !choices.includes(value));
  useEffect(() => { if (value && !choices.includes(value)) setCustom(true); }, [value, choices]);
  return <div><label className="text-sm">{label}<Select aria-label={label} className="mt-1" value={custom ? "__custom" : value} onChange={event => {
    const next = event.target.value; setCustom(next === "__custom"); onChange(next === "__custom" ? "" : next);
  }}><option value="">Not specified</option>{choices.map(choice => <option key={choice} value={choice}>{choice}</option>)}<option value="__custom">Specify another…</option></Select></label>
    {custom ? <input aria-label={`Custom ${label.toLowerCase()}`} className="decision-input mt-2" maxLength={100} value={value} onChange={event => onChange(event.target.value)} placeholder={`Enter ${label.toLowerCase()}`} /> : null}
  </div>;
}
