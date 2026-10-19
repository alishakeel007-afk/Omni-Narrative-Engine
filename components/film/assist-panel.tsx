"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { suggestionKey, type SuggestionContext } from "@/lib/film/suggestions";
import type { AssistField } from "@/lib/film/ai";
import type { StudioChoice, CreativeBrief } from "@/types/studio";

export type AssistRequest = {
  field: AssistField;
  sceneId?: string;
  dialogueId?: string;
  characterId?: string;
  currentValue?: string;
  message?: string;
  context?: { title?: string; premise?: string; sourceScript?: string; visualStyle?: string; creativeBrief?: CreativeBrief };
};

export type AssistResult = {
  reply: string;
  choices?: StudioChoice[] | null;
  value?: string | null;
};

type Cached = { result: AssistResult; at: number };
type AssistApiBody = {
  error?: unknown;
  assist?: AssistResult;
  state?: { messages?: Array<{ role?: string; text?: string; choices?: StudioChoice[] }> };
};

/** API error pages can be HTML in development (and after a stale route reload).
 * Never hand the browser's JSON parser that page: keep the helper usable and
 * show an action the storyteller can take instead. */
async function readAssistResponse(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Your session has expired. Refresh the page and sign in again.");
    }
    if (raw.trimStart().startsWith("<")) {
      throw new Error("The assistant route returned a page instead of a response. Refresh this story, then try again.");
    }
    throw new Error("The assistant returned an unreadable response. Please try again.");
  }
}

/**
 * Shared assistant access for both steps.
 *
 * Proposals are cached per decision point for the session, so revisiting a
 * field renders instantly instead of repeating a model call. Nothing here
 * writes to the project: a result is a proposal the caller applies on accept.
 */
export function useAssist(projectId: string | undefined) {
  const cache = useRef(new Map<string, Cached>());
  const inFlight = useRef<AbortController | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => () => inFlight.current?.abort(), []);

  const cancel = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setPendingKey(null);
  }, []);

  const peek = useCallback(
    (context: SuggestionContext) => cache.current.get(suggestionKey(context))?.result,
    [],
  );

  const ask = useCallback(
    async (
      context: SuggestionContext,
      request: AssistRequest,
      options: { refresh?: boolean } = {},
    ): Promise<AssistResult | undefined> => {
      if (!projectId) return undefined;
      const key = suggestionKey(context);
      const cached = cache.current.get(key);
      if (cached && !options.refresh && !request.message) return cached.result;

      // A newer request supersedes whatever was still running.
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setPendingKey(key);
      setError("");
      try {
        const guest = projectId === "guest";
        const response = await fetch(`/api/studio/${projectId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(guest ? {
            tab: "plan", mode: "develop", requestId: crypto.randomUUID(),
            text: `Help with ONLY this story field: ${request.field}. Preserve my rough story, people, setting and intent. Do not suggest unrelated stories. Return 2-3 usable field values in choices, with each choice.message containing only the chosen value. No plan or media generation.\nMy story and choices: ${JSON.stringify({ ...request.context, sourceScript: request.context?.sourceScript?.slice(0, 6000) })}\nCurrent field value: ${request.currentValue ?? ""}\nMy request: ${request.message ?? "Suggest options grounded in my story."}`,
          } : { action: "assist", ...request }),
          signal: controller.signal,
        });
        const body = await readAssistResponse(response) as AssistApiBody;
        if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The assistant is unavailable.");
        const latest = guest ? [...(body.state?.messages ?? [])].reverse().find(item => item.role === "assistant") : undefined;
        const result: AssistResult | undefined = guest
          ? typeof latest?.text === "string" ? { reply: latest.text, choices: latest.choices } : undefined
          : body.assist;
        if (!result || typeof result.reply !== "string") throw new Error("The assistant returned an empty answer. Please try again.");
        // Only unprompted proposals are reusable; a reply to a typed question
        // belongs to that question, not to the decision point.
        if (!request.message) cache.current.set(key, { result, at: Date.now() });
        return result;
      } catch (cause) {
        if (controller.signal.aborted) return undefined;
        setError(cause instanceof Error ? cause.message : "The assistant is unavailable.");
        return undefined;
      } finally {
        if (inFlight.current === controller) {
          inFlight.current = null;
          setPendingKey(null);
        }
      }
    },
    [projectId],
  );

  /** Warms the next decision while the user reads the current one. */
  const prefetch = useCallback(
    (context: SuggestionContext, request: AssistRequest) => {
      if (!projectId || cache.current.has(suggestionKey(context))) return;
      void (async () => {
        try {
          const response = await fetch(`/api/studio/${projectId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "assist", ...request }),
          });
          if (!response.ok) return;
          const body = await readAssistResponse(response) as AssistApiBody;
          if (body.assist) cache.current.set(suggestionKey(context), { result: body.assist, at: Date.now() });
        } catch {
          // A failed prefetch is silent: the field falls back to asking on demand.
        }
      })();
    },
    [projectId],
  );

  return { ask, peek, prefetch, cancel, pendingKey, error, setError };
}

export function AssistPanel({
  result,
  pending,
  guided,
  onChoose,
  onAccept,
  onMore,
}: {
  result?: AssistResult;
  pending: boolean;
  guided: boolean;
  onChoose: (choice: StudioChoice) => void;
  onAccept: (value: string) => void;
  onMore?: () => void;
}) {
  if (pending && !result) {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm text-[var(--muted)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Thinking of some options…
      </p>
    );
  }
  if (!result) return null;

  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] p-4">
      <p className="text-sm leading-6 text-[var(--ink)]">{result.reply}</p>

      {result.choices?.length ? (
        <ul className="mt-3 grid gap-2">
          {result.choices.map((choice) => (
            <li key={choice.label}>
              <button
                type="button"
                onClick={() => onChoose(choice)}
                className="w-full rounded-lg border border-[var(--line)] px-3 py-2.5 text-left transition hover:bg-black/[0.04]"
              >
                <span className="block text-sm font-semibold text-[var(--ink)]">
                  {choice.label}
                </span>
                {choice.description ? (
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">
                    {choice.description}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {result.value ? (
        <div className="mt-3 rounded-lg border border-[var(--line)] p-3">
          <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">
            {result.value}
          </p>
          <button
            type="button"
            onClick={() => onAccept(result.value as string)}
            className="mt-3 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:opacity-90"
          >
            Use this
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        {onMore ? <button
          type="button"
          onClick={onMore}
          disabled={pending}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--ink)] disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          )}
          More options
        </button> : null}
        {guided ? (
          <span className="text-xs text-[var(--muted)]">
            Or write your own below — these are only suggestions.
          </span>
        ) : null}
      </div>
    </div>
  );
}
