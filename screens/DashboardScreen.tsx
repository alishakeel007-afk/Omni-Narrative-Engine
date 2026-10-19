"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { Film, Loader2, Plus, Trash2 } from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import { readStudioEntry, removeStudioEntry, linkStudioEntry } from "@/lib/studio/entry";
import type { StudioProject } from "@/types/studio";

export default function DashboardScreen() {
  const router = useRouter();
  const search = useSearchParams();
  const [projects, setProjects] = useState<StudioProject[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const claimed = useRef(false);

  /**
   * The landing demo's handoff.
   *
   * A visitor types an idea before signing in; the text stays in their own
   * browser under an opaque entry id, which arrives here as `?start=`. It
   * becomes a real project and they land on its Setup step with the idea
   * already in place. If anything fails they simply see their project list,
   * because the idea is still recoverable from the guest cookie server-side.
   */
  useEffect(() => {
    const start = search?.get("start");
    if (!start || claimed.current) return;
    claimed.current = true;
    const entry = readStudioEntry(start);
    setHandoff(true);
    void (async () => {
      try {
        if (!entry) throw new Error("This saved idea is no longer available in this browser. Return to the landing page to start again.");
        // A guest trial is claimed first, so the conversation it already holds
        // is not abandoned in favour of an empty project.
        const trial = entry.guestProjectId ? await fetch("/api/studio/guest/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry?.guestProjectId ? { id: entry.guestProjectId } : {}),
        })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null) : null;
        let id: string | undefined = entry?.projectId ?? trial?.id ?? undefined;
        if (!id) {
          const created = await fetch("/api/studio", { method: "POST" });
          const body = await created.json();
          if (!created.ok) throw new Error(body.error || "Your story could not be created.");
          id = body.id as string;
        }
        linkStudioEntry(start, id);
        // Every choice they made before signing up is applied, not just the
        // idea text, so the film opens as they left it on the landing page.
        const patch: Record<string, unknown> = { step: trial?.state?.scenes?.length ? "script" : "setup" };
        if (entry?.text?.trim()) patch.premise = entry.text.trim();
        if (entry?.setup?.assist) patch.assist = entry.setup.assist;
        if (entry?.setup?.language) patch.language = entry.setup.language;
        if (entry?.setup?.visualStyle) patch.visualStyle = entry.setup.visualStyle;
        if (entry?.setup?.clipSeconds) patch.clipSeconds = entry.setup.clipSeconds;
        if (entry?.setup?.sourceScript) patch.sourceScript = entry.setup.sourceScript;
        if (Object.keys(patch).length > 1) {
          const saved = await fetch(`/api/studio/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "workflow", patch }),
          });
          if (!saved.ok) throw new Error("Your setup could not be saved. Your idea is still in this browser.");
        }
        removeStudioEntry(start);
        router.replace(`/story/${id}` as Route);
      } catch (cause) {
        // Fall back to the list rather than stranding them on a spinner.
        setHandoff(false);
        setError(cause instanceof Error ? cause.message : "Your story could not be opened. Your idea is still saved in this browser.");
        router.replace("/dashboard" as Route);
      }
    })();
  }, [search, router]);

  useEffect(() => {
    let active = true;
    setLoadFailed(false);
    (async () => {
      try {
        const response = await fetch("/api/studio", { cache: "no-store" });
        const body = await response.json();
        if (!active) return;
        if (!response.ok) throw new Error(body.error || "Your projects could not be loaded.");
        setProjects(body.projects);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Your projects could not be loaded.");
        setLoadFailed(true);
        setProjects([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  const create = useCallback(async () => {
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/studio", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The project could not be created.");
      router.push(`/story/${body.id}` as Route);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be created.");
      setCreating(false);
    }
  }, [router]);

  const newStarted = useRef(false);
  useEffect(() => {
    if (search?.get("new") === "1" && !newStarted.current) {
      newStarted.current = true;
      void create();
    }
  }, [search, create]);

  const remove = useCallback(async (project: StudioProject) => {
    if (!window.confirm(`Delete "${project.title}"? This cannot be undone.`)) return;
    setDeleting(project.id);
    setError("");
    try {
      const response = await fetch(`/api/studio/${project.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "The project could not be deleted.");
      }
      setProjects((current) => (current || []).filter((item) => item.id !== project.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The project could not be deleted.");
    } finally {
      setDeleting(null);
    }
  }, []);

  if (handoff)
    return (
      <ProtectedRoute>
        <main className="mx-auto max-w-2xl px-6 py-24 text-center">
          <p className="flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Setting up your story…
          </p>
        </main>
      </ProtectedRoute>
    );

  return (
    <ProtectedRoute>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--ink)]">
              Your stories
            </h1>
            <p className="mt-1.5 text-sm text-[var(--muted)]">
              Open a story to pick up where you left off.
            </p>
          </div>
          <button
            type="button"
            onClick={create}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:opacity-90 disabled:opacity-60"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
            {creating ? "Creating story…" : "New story"}
          </button>
        </header>

        {error ? (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-[var(--line)] px-4 py-3 text-sm font-medium text-[var(--ink)]"
          >
            {error}{" "}
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="underline underline-offset-2"
            >
              Try again
            </button>
          </p>
        ) : null}

        {projects === null ? (
          <p className="mt-10 flex items-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading your projects…
          </p>
        ) : loadFailed ? (
          <p className="mt-6 text-sm text-[var(--muted)]">Your stories could not be loaded. Retry the connection to see your saved projects.</p>
        ) : projects.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-[var(--line)] px-6 py-16 text-center">
            <Film className="mx-auto h-7 w-7 text-[var(--ink)]" aria-hidden />
            <h2 className="mt-4 text-lg font-semibold text-[var(--ink)]">
              No stories yet
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
              Start with an idea or paste a script you already have, and work
              through setup, script, generation and editing.
            </p>
            <button
              type="button"
              onClick={create}
              disabled={creating}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:opacity-90 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Create your first story
            </button>
          </div>
        ) : (
          <ul className="mt-8 divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)]">
            {projects.map((project) => (
              <li key={project.id} className="flex items-center gap-4 px-5 py-4">
                <button
                  type="button"
                  onClick={() => router.push(`/story/${project.id}` as Route)}
                  className="flex-1 text-left"
                >
                  <span className="block text-sm font-semibold text-[var(--ink)]">
                    {project.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    Edited {formatWhen(project.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(project)}
                  disabled={deleting === project.id}
                  aria-label={`Delete ${project.title}`}
                  className="rounded-full border border-[var(--line)] p-2 text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-60"
                >
                  {deleting === project.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </ProtectedRoute>
  );
}

function formatWhen(value: string) {
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return "recently";
  const minutes = Math.round((Date.now() - when.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return when.toLocaleDateString();
}
