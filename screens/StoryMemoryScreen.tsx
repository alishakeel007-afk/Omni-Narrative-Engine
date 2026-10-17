"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ProtectedRoute } from "@/components/protected-route";
import { useStory } from "@/context/StoryContext";
import { groupPersistedMemories, STORY_MEMORY_GROUP_LABELS, type StoryMemoryGroupKey } from "@/lib/story-memory-view";
import ScreenLayout from "@/screens/ScreenLayout";

const GROUPS: StoryMemoryGroupKey[] = ["choices", "characters", "locations", "items", "plot"];

export default function StoryMemoryScreen() {
  const { setup, state, pendingSaveCount } = useStory();
  const memories = groupPersistedMemories(state.persistedMemories);
  const timeline = state.memoryTimeline.slice(-6).reverse();
  const hasProject = Boolean(setup.projectId);

  return (
    <ProtectedRoute>
      <ScreenLayout eyebrow="Story Memory" title="Continuity Board" description="Saved narrative facts for the selected interactive-story draft, plus a separate recent-scene timeline." maxWidth="max-w-6xl">
        <ProjectIdentity title={state.projectTitle || setup.storyTitle} draftVersion={state.draftVersion} source={state.recoverySource} pendingSaves={pendingSaveCount()} />
        <div className="mb-6 flex flex-wrap gap-3">
          <Link href="/dashboard" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">Dashboard</Link>
          <Link href="/story/play" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">Play</Link>
          <Link href="/story/history" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">History</Link>
          <Link href="/story/state" className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80">Player State</Link>
        </div>

        {state.recoveryError ? <section className="mb-5 rounded-[1.25rem] border border-rose-300/30 bg-rose-500/10 p-4 text-sm text-rose-100"><p>{state.recoveryError}</p><Link href="/dashboard" className="mt-2 inline-block font-semibold text-gold underline">Return to Dashboard</Link></section> : null}
        {state.isLoading && hasProject ? <Loading /> : null}

        {!state.isLoading && !hasProject ? (
          <section className="glass-panel rounded-[1.5rem] p-8 text-center"><p className="text-sm font-semibold text-white">No saved project selected</p><p className="mx-auto mt-2 max-w-md text-sm leading-7 text-white/72">Select one of your projects from the Dashboard to load its authenticated saved facts.</p><Link href="/dashboard" className="mt-5 inline-block rounded-full border border-gold/25 bg-gold/10 px-6 py-3 text-sm font-semibold text-gold">Open Dashboard</Link></section>
        ) : null}

        {!state.isLoading && hasProject ? <>
          <div className="grid gap-5 lg:grid-cols-2">
            {GROUPS.map((group) => <MemoryPanel key={group} title={STORY_MEMORY_GROUP_LABELS[group]}>
              {memories[group].length === 0 ? <Empty text="No saved facts in this category yet." /> : memories[group].map((memory) => <article key={memory.id} className="rounded-[1rem] border border-white/10 bg-black/20 p-4"><p className="text-sm leading-7 text-white/85">{memory.content}</p></article>)}
            </MemoryPanel>)}
          </div>
          <section className="glass-panel mt-5 rounded-[1.5rem] p-5"><p className="text-xs uppercase tracking-[0.28em] text-starlight/75">Recent Scene Timeline</p><p className="mt-2 text-sm text-white/60">A recent interaction record, not an authoritative plot-fact list.</p><div className="mt-4 space-y-3">{timeline.length === 0 ? <Empty text="No saved decisions yet." /> : timeline.map((item) => <article key={`${item.timestamp}-${item.sceneNumber}-${item.userChoice}`} className="rounded-[1rem] border border-white/10 bg-black/20 p-4"><p className="text-xs uppercase tracking-[0.22em] text-gold">Scene {item.sceneNumber}</p><p className="mt-2 text-sm text-white/85">{item.userChoice}</p>{item.result ? <p className="mt-1 text-xs leading-6 text-white/60">{item.result}</p> : null}</article>)}</div></section>
        </> : null}
      </ScreenLayout>
    </ProtectedRoute>
  );
}

function ProjectIdentity({ title, draftVersion, source, pendingSaves }: { title: string; draftVersion?: number; source: string; pendingSaves: number }) {
  const sourceLabel = source === "database" ? "Loaded from saved database project" : source === "offline-cache" ? "Restored from browser/offline cache — not yet reverified" : source === "local" ? "Unsaved local state" : "Project recovery required";
  return <section className="mb-5 rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4"><p className="text-xs uppercase tracking-[0.22em] text-starlight/70">Selected project</p><p className="mt-1 font-semibold text-white">{title || "Untitled story"}{draftVersion ? ` · Draft ${draftVersion}` : ""}</p><p className="mt-1 text-xs text-white/60">{pendingSaves > 0 ? `Saving ${pendingSaves} change${pendingSaves === 1 ? "" : "s"}…` : sourceLabel}</p></section>;
}

function Loading() { return <div className="glass-panel mb-5 rounded-[1.5rem] p-5 text-sm text-white/70">Loading saved story facts…</div>; }
function MemoryPanel({ title, children }: { title: string; children: ReactNode }) { return <section className="glass-panel rounded-[1.5rem] p-5"><p className="text-xs uppercase tracking-[0.28em] text-starlight/75">{title}</p><div className="mt-4 space-y-3">{children}</div></section>; }
function Empty({ text }: { text: string }) { return <div className="rounded-[1rem] border border-white/10 bg-black/20 p-4 text-sm text-white/60">{text}</div>; }
