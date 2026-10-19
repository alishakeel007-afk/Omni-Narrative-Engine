"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Loader2, X } from "lucide-react";
import type { StudioState } from "@/types/studio";
import { AssistPanel, useAssist, type AssistRequest, type AssistResult } from "./assist-panel";

/** Every field uses the same contextual, explicit proposal/accept interaction. */
export function FieldAssist({ projectId, state, field, label, value = "", sceneId, characterId, dialogueId, onAccept }: {
  projectId: string; state: StudioState; field: AssistRequest["field"]; label: string; value?: string;
  sceneId?: string; characterId?: string; dialogueId?: string; onAccept: (value: string) => void | Promise<unknown>;
}) {
  const assist = useAssist(projectId);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AssistResult>();
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  const context = { title: state.title, premise: state.premise, sourceScript: state.sourceScript, visualStyle: state.visualStyle, creativeBrief: state.creativeBrief };
  // Blur-saving this same answer can update scene metadata while help is in
  // flight. Cancel only when the actual decision or story context changes.
  const depends = JSON.stringify([context, sceneId, characterId, dialogueId, value]);
  useEffect(() => { assist.cancel(); setResult(undefined); }, [depends, assist.cancel]);
  const ask = async () => {
    setOpen(true); setAcceptError("");
    const response = await assist.ask({ field, language: state.language ?? "en", assist: state.assist ?? "guided", depends },
      { field, currentValue: value, sceneId, characterId, dialogueId, message: message.trim() || undefined, context }, { refresh: true });
    if (response) setResult(response);
  };
  const accept = async (answer: string) => {
    setAccepting(true); setAcceptError("");
    try { const saved = await onAccept(answer); if (saved === false) throw new Error(); setResult(undefined); setOpen(false); }
    catch { setAcceptError("This suggestion could not be saved. Please try again."); }
    finally { setAccepting(false); }
  };
  return <div className="field-assist">
    <button type="button" className="field-assist-trigger" disabled={Boolean(assist.pendingKey)} onClick={() => void ask()}>
      {assist.pendingKey ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <img src="/omni-mark.png" alt="" className="omni-assist-mark" />}
      {assist.pendingKey ? "Omni is thinking about your story…" : `Ask Omni · ${label}`}
    </button>
    {open ? <div className="field-assist-body" aria-busy={Boolean(assist.pendingKey) || accepting}>
      <div className="flex items-center justify-between gap-3"><label className="text-xs" htmlFor={`ask-${field}-${sceneId ?? characterId ?? "story"}-${dialogueId ?? ""}`}>Anything specific? <span className="text-[var(--muted)]">Optional</span></label>
        <button type="button" aria-label="Close Omni help" onClick={() => { assist.cancel(); setOpen(false); }}><X size={16} /></button></div>
      <form className="mt-2 flex gap-2" onSubmit={event => { event.preventDefault(); void ask(); }}>
        <input id={`ask-${field}-${sceneId ?? characterId ?? "story"}-${dialogueId ?? ""}`} value={message} maxLength={2000} onChange={event => setMessage(event.target.value)} placeholder="For example: keep the mood hopeful" className="min-w-0 flex-1 rounded-lg border border-[var(--line)] px-3 py-2 text-sm" />
        <button type="submit" className="guest-pill" disabled={Boolean(assist.pendingKey)}>Ask</button>
      </form>
      {assist.error || acceptError ? <p role="alert" className="mt-3 text-sm">{assist.error || acceptError} <button type="button" className="underline" onClick={() => void ask()}>Try again</button></p> : null}
      <fieldset disabled={accepting}><AssistPanel result={result} pending={Boolean(assist.pendingKey)} guided={state.assist !== "custom"}
        onChoose={choice => void accept(choice.message)} onAccept={answer => void accept(answer)} onMore={() => void ask()} /></fieldset>
    </div> : null}
  </div>;
}

/** Keeps the typed value in the help request even when a blur-save is in flight. */
export function AssistedInput({ value = "", onSave, inputLabel, rows = 3, ...props }: Omit<ComponentProps<typeof FieldAssist>, "onAccept"> & {
  onSave: (value: string) => Promise<boolean>; inputLabel: string; rows?: number;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const saveNumber = useRef(0);
  useEffect(() => setDraft(value), [value]);
  const persist = async (next: string) => {
    if (next === value) return true;
    const request = ++saveNumber.current;
    setSaving(true); setSaveError("");
    try {
      const saved = await onSave(next);
      if (!saved) throw new Error();
      return true;
    } catch {
      if (request === saveNumber.current) setSaveError("This answer was not saved. Try again before moving on.");
      return false;
    } finally {
      if (request === saveNumber.current) setSaving(false);
    }
  };
  return <div><label className="block"><span className="text-xs font-medium">{inputLabel}</span>
    <textarea aria-label={inputLabel} className="decision-input mt-2" rows={rows} value={draft} onChange={event => setDraft(event.target.value)}
      onBlur={() => void persist(draft)} /></label>
    {saving ? <p className="mt-1 text-xs text-[var(--muted)]">Saving…</p> : null}
    {saveError ? <p className="mt-1 text-xs" role="alert">{saveError}</p> : null}
    <FieldAssist {...props} value={draft} onAccept={answer => { setDraft(answer); return persist(answer); }} />
  </div>;
}
