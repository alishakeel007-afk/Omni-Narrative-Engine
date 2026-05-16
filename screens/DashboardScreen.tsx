"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardCard } from "@/components/dashboard-card";
import { ProtectedRoute } from "@/components/protected-route";
import ScreenLayout from "@/screens/ScreenLayout";
import { useStory } from "@/context/StoryContext";
import { countCustomChoices } from "@/lib/story-engine";
import {
  CREATE_STORY_STORAGE_KEY,
  createDefaultDraft,
  loadCreateStoryDraft
} from "@/lib/create-story-storage";
import {
  DEFAULT_VIDEO_SCENARIO,
  VIDEO_DRAFT_STORAGE_KEY,
  VIDEO_STUDIO_FLOW_STORAGE_KEY,
  VIDEO_VOICE_RESULT_STORAGE_KEY,
  loadVideoStudioFlow
} from "@/lib/video-storage";
import {
  STORY_COMPLETED_STORAGE_KEY,
  STORY_PROGRESS_STORAGE_KEY
} from "@/lib/story-storage";

type ResumeTarget = {
  canDelete: boolean;
  description: string;
  href: string;
  label: string;
  source: "active-story" | "custom-story" | "saved-setup" | "video-studio";
  title: string;
};

type DatabaseDraft = {
  id: string;
  isActive: boolean;
  status: string;
  title: string;
  updatedAt: string;
  versionNumber: number;
};

type DatabaseProject = {
  id: string;
  title: string;
  drafts: DatabaseDraft[];
};

export default function DashboardScreen() {
  const router = useRouter();
  const { saveSetupOnly, setup, state, updateSetup } = useStory();
  const [resumeTarget, setResumeTarget] = useState<ResumeTarget | null>(null);
  const [databaseProjects, setDatabaseProjects] = useState<DatabaseProject[]>([]);
  const currentScene = state.currentScene.sceneNumber;
  const hasProgress = state.memoryTimeline.length > 0 || state.currentScene.sceneNumber > 1;
  const customChoiceCount = countCustomChoices(state);
  const recentSessionLabel = state.lastSavedAt
    ? new Date(state.lastSavedAt).toLocaleString()
    : "No saved session yet";
  const dynamicStats = [
    { label: "Saved Stories", value: "1 Active Story" },
    { label: "Favorite Genres", value: setup.genre },
    {
      label: "Recent Sessions",
      value: state.lastSavedAt ? new Date(state.lastSavedAt).toLocaleDateString() : "New Run"
    },
    { label: "Total Scenes Generated", value: String(currentScene) },
    { label: "Total Custom Choices Made", value: String(customChoiceCount) }
  ];
  const startCreateStory = () => {
    updateSetup({ mode: "custom" });
    saveSetupOnly({ mode: "custom" });
    router.push("/setup");
  };
  const fallbackResumeTarget = useMemo<ResumeTarget>(() => ({
    canDelete: hasProgress,
    description: hasProgress
      ? `Resume Scene ${currentScene} with ${setup.characterName}'s latest decisions still tracked in memory.`
      : `Open the first scene for ${setup.characterName} and begin the saved ${setup.mode} setup.`,
    href: hasProgress ? "/story/play" : "/setup",
    label: hasProgress ? "Continue Last Story" : "Saved Setup",
    source: hasProgress ? "active-story" : "saved-setup",
    title: setup.storyTitle
  }), [currentScene, hasProgress, setup]);

  useEffect(() => {
    const customRaw = window.localStorage.getItem(CREATE_STORY_STORAGE_KEY);

    if (customRaw) {
      const draft = loadCreateStoryDraft();
      const defaultDraft = createDefaultDraft();
      const hasCustomWork =
        draft.scenes.length > 0 ||
        draft.storyTitle !== defaultDraft.storyTitle ||
        draft.audio.voiceStatus !== "idle" ||
        draft.audio.backgroundMusicStatus !== "idle" ||
        draft.video.status !== "idle";

      if (hasCustomWork) {
        setResumeTarget({
          canDelete: true,
          description:
            draft.video.status === "ready"
              ? `Open the custom video preview for ${draft.scenes.length} scene${draft.scenes.length === 1 ? "" : "s"}.`
              : `Resume the custom scene builder with ${draft.scenes.length || 1} scene${draft.scenes.length === 1 ? "" : "s"} saved.`,
          href: draft.video.status === "ready" ? "/video-preview?mode=custom" : "/story-builder",
          label: "Continue AI Story Studio",
          source: "custom-story",
          title: draft.storyTitle
        });
        return;
      }
    }

    const videoRaw = window.localStorage.getItem(VIDEO_STUDIO_FLOW_STORAGE_KEY);

    if (videoRaw) {
      const flow = loadVideoStudioFlow();
      const hasVideoWork =
        Boolean(flow.script) ||
        Boolean(flow.generatedStory) ||
        Boolean(flow.acceptedStory) ||
        Boolean(flow.voiceResult) ||
        flow.stage !== "setup" ||
        flow.roughIdea !== DEFAULT_VIDEO_SCENARIO ||
        flow.music.status !== "idle";

      if (hasVideoWork) {
        setResumeTarget({
          canDelete: true,
          description: flow.script
            ? `Resume Guided Video Studio at ${flow.stage} with ${flow.script.scenes.length} generated scene${flow.script.scenes.length === 1 ? "" : "s"}.`
            : "Resume the Guided Video Studio setup where you left off.",
          href: flow.stage === "preview" ? "/video-preview?mode=guided" : "/video",
          label: "Continue Guided Video Studio",
          source: "video-studio",
          title: flow.script?.title || "Guided Video Studio Draft"
        });
        return;
      }
    }

    setResumeTarget(fallbackResumeTarget);
  }, [fallbackResumeTarget]);

  useEffect(() => {
    let cancelled = false;

    async function loadDatabaseProjects() {
      try {
        const response = await fetch("/api/story/projects");
        if (!response.ok) return;
        const data = await response.json() as { projects?: DatabaseProject[] };
        if (!cancelled) {
          setDatabaseProjects(data.projects ?? []);
        }
      } catch {
        if (!cancelled) {
          setDatabaseProjects([]);
        }
      }
    }

    loadDatabaseProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeResumeTarget = resumeTarget ?? fallbackResumeTarget;

  const deleteSavedStory = () => {
    if (!activeResumeTarget.canDelete) return;

    const confirmed = window.confirm(
      `Delete "${activeResumeTarget.title}"? This removes the saved story from this browser.`
    );

    if (!confirmed) return;

    if (activeResumeTarget.source === "custom-story") {
      window.localStorage.removeItem(CREATE_STORY_STORAGE_KEY);
    }

    if (activeResumeTarget.source === "video-studio") {
      window.localStorage.removeItem(VIDEO_STUDIO_FLOW_STORAGE_KEY);
      window.localStorage.removeItem(VIDEO_DRAFT_STORAGE_KEY);
      window.localStorage.removeItem(VIDEO_VOICE_RESULT_STORAGE_KEY);
    }

    if (activeResumeTarget.source === "active-story") {
      window.localStorage.removeItem(STORY_PROGRESS_STORAGE_KEY);
      window.localStorage.removeItem(STORY_COMPLETED_STORAGE_KEY);
    }

    window.location.reload();
  };

  const createNewDraftVersion = async (storyProjectId: string) => {
    const response = await fetch("/api/story/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storyProjectId })
    });

    if (!response.ok) return;

    const projectsResponse = await fetch("/api/story/projects");
    if (!projectsResponse.ok) return;
    const data = await projectsResponse.json() as { projects?: DatabaseProject[] };
    setDatabaseProjects(data.projects ?? []);
  };

  return (
    <ProtectedRoute>
      <ScreenLayout eyebrow="User Dashboard" title="Narrative Command Center" description="Quick access to saved progress, genre preferences, and usage analytics for the AI story experience." maxWidth="max-w-7xl">
          <div className="mb-6 flex flex-col items-center justify-between gap-4 rounded-[1.5rem] border border-gold/20 bg-gold/5 p-6 sm:flex-row">
            <div>
              <h2 className="text-xl font-semibold text-white">Ready for your next adventure?</h2>
              <p className="mt-1 text-sm text-white/70">Start a new guided or custom story.</p>
            </div>
            <Link
              href="/story/mode?fresh=1"
              className="rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-6 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.02]"
            >
              Start New Story
            </Link>
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Link
              href={activeResumeTarget.href}
              className="glass-panel gold-ring rounded-[1.75rem] p-6 transition hover:-translate-y-1"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-gold">{activeResumeTarget.label}</p>
              <h2 className="mt-4 text-2xl font-semibold text-white">{activeResumeTarget.title}</h2>
              <p className="mt-3 text-sm leading-7 text-white/65">{activeResumeTarget.description}</p>
            </Link>

            <Link
              href="/story/mode?fresh=1"
              className="glass-panel rounded-[1.75rem] p-6 transition hover:-translate-y-1"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-starlight/78">Start New Story</p>
              <h2 className="mt-4 text-2xl font-semibold text-white">Create Fresh Setup</h2>
              <p className="mt-3 text-sm leading-7 text-white/65">
                Pick a genre, define a protagonist, and choose guided or custom story mode.
              </p>
            </Link>

            <button
              type="button"
              onClick={startCreateStory}
              className="glass-panel rounded-[1.75rem] p-6 text-left transition hover:-translate-y-1"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-gold">Create Your Own Story</p>
              <h2 className="mt-4 text-2xl font-semibold text-white">Custom Scene Builder</h2>
              <p className="mt-3 text-sm leading-7 text-white/65">
                Write scenes and character dialogue yourself, then generate voices, music, and a preview placeholder.
              </p>
            </button>

            <Link
              href="/video"
              className="glass-panel rounded-[1.75rem] p-6 transition hover:-translate-y-1"
            >
              <p className="text-xs uppercase tracking-[0.28em] text-gold">Video Studio</p>
              <h2 className="mt-4 text-2xl font-semibold text-white">Build Movie Scenes</h2>
              <p className="mt-3 text-sm leading-7 text-white/65">
                Turn one scenario into scene-by-scene script, dialogue, prompts, and voice audio.
              </p>
            </Link>

            <div className="glass-panel rounded-[1.75rem] p-6">
              <div className="flex items-start justify-between gap-3">
                <Link href={activeResumeTarget.href} className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-[0.28em] text-white/45">Saved Stories</p>
                  <h2 className="mt-4 text-2xl font-semibold text-white">{activeResumeTarget.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-white/65">{activeResumeTarget.description}</p>
                </Link>
                {activeResumeTarget.canDelete ? (
                  <button
                    type="button"
                    onClick={deleteSavedStory}
                    className="shrink-0 rounded-full border border-red-400/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/15"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>

            <div className="glass-panel rounded-[1.75rem] p-6">
              <p className="text-xs uppercase tracking-[0.28em] text-white/45">Recent Sessions</p>
              <h2 className="mt-4 text-2xl font-semibold text-white">
                {hasProgress ? `Scene ${currentScene}` : "Waiting to Begin"}
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/65">{recentSessionLabel}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {dynamicStats.map((item, index) => (
              <DashboardCard key={item.label} title={item.label} value={item.value} accent={index === 0 ? "gold" : "blue"} />
            ))}
          </div>

          <section className="mt-8 glass-panel rounded-[1.75rem] p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-white/45">Database Draft Versions</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">Multi-Draft System</h2>
                <p className="mt-2 text-sm leading-7 text-white/65">
                  Each database story project can keep several draft versions, with one active draft at a time.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              {databaseProjects.length > 0 ? (
                databaseProjects.map((project) => (
                  <div key={project.id} className="rounded-[1.25rem] border border-white/10 bg-black/25 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{project.title}</h3>
                        <p className="mt-1 text-sm text-white/55">
                          {project.drafts.length} draft version{project.drafts.length === 1 ? "" : "s"} saved in Supabase.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => createNewDraftVersion(project.id)}
                        className="rounded-full border border-gold/25 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/15"
                      >
                        Create New Draft Version
                      </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {project.drafts.map((draft) => (
                        <span
                          key={draft.id}
                          className={`rounded-full border px-3 py-1 text-xs ${
                            draft.isActive
                              ? "border-gold/30 bg-gold/10 text-gold"
                              : "border-white/10 bg-white/5 text-white/60"
                          }`}
                        >
                          v{draft.versionNumber} {draft.isActive ? "Active" : draft.status.toLowerCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-[1.25rem] border border-white/10 bg-black/25 p-4 text-sm leading-7 text-white/60">
                  No Supabase story projects yet. New database-backed projects created through the story API will appear here with all draft versions.
                </div>
              )}
            </div>
          </section>
    </ScreenLayout>
    </ProtectedRoute>
  );
}
