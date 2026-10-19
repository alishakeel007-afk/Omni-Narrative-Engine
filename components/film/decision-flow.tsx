"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

export type DecisionPage = { id: string; title: string; description?: string; content: ReactNode; optional?: boolean; ready?: boolean; skipTo?: string; skipLabel?: string };

/** Small, resumable decisions inside a stage. Navigation never counts as completed work. */
export function DecisionFlow({ storageKey, pages, onBeforeNext, finish, finishLabel = "Continue", busy = false, children, onPageChange }: {
  storageKey: string; pages: DecisionPage[]; onBeforeNext?: (id: string) => Promise<boolean>;
  finish?: () => void | Promise<void>; finishLabel?: string; busy?: boolean;
  children?: ReactNode; onPageChange?: (id: string) => void;
}) {
  const [selected, setSelected] = useState(pages[0]?.id ?? "");
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { const saved = localStorage.getItem(storageKey); if (saved) setSelected(saved); } catch { /* storage is optional */ }
  }, [storageKey]);
  const index = Math.max(0, pages.findIndex(page => page.id === selected));
  const page = pages[index];
  useEffect(() => { if (page) onPageChange?.(page.id); }, [page?.id, onPageChange]);
  const navigate = (at: number) => {
    if (!pages[at]) return;
    setSelected(pages[at].id); setError("");
    try { localStorage.setItem(storageKey, pages[at].id); } catch { /* storage is optional */ }
    anchor.current?.scrollIntoView({ block: "start", behavior: "instant" });
  };
  if (!page) return null;
  const next = async () => {
    setMoving(true); setError("");
    try {
      if (onBeforeNext && !await onBeforeNext(page.id)) { setError("Please save this answer before continuing."); return; }
      if (index < pages.length - 1) navigate(index + 1);
      else await finish?.();
    } catch { setError("This step could not be saved. Your answer is still here; try again."); }
    finally { setMoving(false); }
  };
  return <div className="decision-flow" ref={anchor}>
    <div className="decision-flow-top"><span>Part {index + 1} of {pages.length}{page.optional ? " · Optional" : ""}</span>
      <label className="decision-jump"><span className="sr-only">Jump to a small step</span>
        <select aria-label="Jump to a small step" value={page.id} disabled={moving || busy} onChange={event => {
          const at = pages.findIndex(item => item.id === event.target.value);
          setMoving(true);
          void (async () => { if (!onBeforeNext || await onBeforeNext(page.id)) navigate(at); else setError("Your answer could not be saved."); })().finally(() => setMoving(false));
        }}>{pages.map((item, at) => <option key={item.id} value={item.id}>{at + 1}. {item.title}</option>)}</select>
      </label>
    </div>
    <div className="decision-content" key={page.id}>
      <h3 className="decision-heading" tabIndex={-1}>{page.title}</h3>
      {page.description ? <p className="decision-description">{page.description}</p> : null}
      <div className="decision-answer">{page.content}</div>
    </div>
    {children}
    {error ? <p role="alert" className="film-help">{error}</p> : null}
    <div className="decision-actions">
      <button type="button" disabled={index === 0 || moving || busy} className="decision-back" onClick={async () => {
        setMoving(true); try { if (!onBeforeNext || await onBeforeNext(page.id)) navigate(index - 1); else setError("Your answer could not be saved."); } finally { setMoving(false); }
      }}><ArrowLeft size={16} aria-hidden /> Back</button>
      {page.skipTo ? <button type="button" className="film-text-button" disabled={moving || busy} onClick={async () => {
        setMoving(true); try { if (!onBeforeNext || await onBeforeNext(page.id)) navigate(pages.findIndex(item => item.id === page.skipTo)); else setError("Your answer could not be saved."); } finally { setMoving(false); }
      }}>{page.skipLabel ?? "Skip these details"}</button> : null}
      {index < pages.length - 1 || finish ? <button type="button" className="decision-next" disabled={page.ready === false || moving || busy} onClick={() => void next()}>
        {moving || busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
        {index < pages.length - 1 ? "Continue" : finishLabel}<ArrowRight size={16} aria-hidden />
      </button> : <span className="film-help">Changes save as you go.</span>}
    </div>
  </div>;
}
