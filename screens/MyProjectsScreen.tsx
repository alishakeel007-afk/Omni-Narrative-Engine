"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clapperboard, FolderOpen, Loader2, Play, RefreshCcw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/protected-route";
import ScreenLayout from "@/screens/ScreenLayout";
import { partitionMyProjects, type MyProjectsProject } from "@/lib/my-projects";
import { loadCustomStoryFromDatabase } from "@/lib/custom-story-db";
import { saveCreateStoryDraft } from "@/lib/create-story-storage";

type Project = MyProjectsProject & {
  title: string;
  updatedAt: string;
  language: "en" | "ur";
  resumeStage: string | null;
  sceneCount: number;
};

type Tab = "in-progress" | "completed";

function stageLabel(stage: string | null) {
  if (!stage) return "Setup";
  return stage.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function ProjectCard({ project, completed, onComplete }: { project: Project; completed: boolean; onComplete: (project: Project) => void }) {
  const router = useRouter();
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const needsAttention = project.status === "COMPLETED" && !project.completion.eligible;

  const isCustom = project.workflow === "custom-builder";
  const resume = () => router.push(isCustom ? `/story-builder?project=${encodeURIComponent(project.id)}` : `/video?project=${encodeURIComponent(project.id)}`);
  const watch = async () => {
    if (!isCustom) { router.push(`/video-preview?mode=guided&project=${encodeURIComponent(project.id)}`); return; }
    const draft = await loadCustomStoryFromDatabase(project.id);
    if (!draft) { setCompletionError("Could not restore this Custom project for preview. Try Edit Project instead."); return; }
    saveCreateStoryDraft(draft);
    router.push(`/video-preview?mode=custom&project=${encodeURIComponent(project.id)}`);
  };
  const markComplete = async () => {
    setIsCompleting(true);
    setCompletionError("");
    try {
      const response = await fetch(`/api/story/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setCompletionError(payload?.error ?? "Could not mark this project complete. Resolve the listed media first and try again.");
        return;
      }
      onComplete(project);
    } catch {
      setCompletionError("Could not update this project. Check your connection and try again.");
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <article className="glass-panel rounded-[1.5rem] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold text-white">{project.title}</h2>
            <span className="rounded-full border border-starlight/25 bg-starlight/10 px-2.5 py-1 text-xs font-medium text-starlight">
              {project.language === "ur" ? "Urdu" : "English"}
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80">
              {isCustom ? "Custom" : "Guided"}
            </span>
            {completed ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-200"><CheckCircle2 className="h-3.5 w-3.5" /> Completed</span>
            ) : needsAttention ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/35 bg-amber-300/15 px-2.5 py-1 text-xs font-medium text-amber-100"><TriangleAlert className="h-3.5 w-3.5" /> Needs attention</span>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/75">In progress</span>
            )}
          </div>
          <p className="mt-2 text-sm text-white/75">
            Updated {new Date(project.updatedAt).toLocaleString()} · {project.sceneCount} scene{project.sceneCount === 1 ? "" : "s"} · Saved stage: {stageLabel(project.resumeStage)}
          </p>
          {needsAttention ? <p className="mt-3 text-sm text-amber-100">{project.completion.reasons[0] ?? "Required media changed after completion. Open the project to resolve it."}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {completed ? (
            <>
              <button type="button" onClick={() => void watch()} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-4 py-2 text-sm font-semibold text-slate-950"><Play className="h-4 w-4" /> Watch Story</button>
              <button type="button" onClick={resume} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:border-gold/30"><Clapperboard className="h-4 w-4" /> Edit Project</button>
            </>
          ) : (
            <button type="button" onClick={resume} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-4 py-2 text-sm font-semibold text-slate-950"><FolderOpen className="h-4 w-4" /> Resume Project</button>
          )}
          {!completed && project.completion.eligible ? (
            <button type="button" disabled={isCompleting} onClick={markComplete} className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 disabled:opacity-60">
              {isCompleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Mark Project Complete
            </button>
          ) : null}
        </div>
      </div>
      {completionError ? <p role="alert" className="mt-3 text-sm text-red-100">{completionError}</p> : null}
    </article>
  );
}

export default function MyProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<Tab>("in-progress");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const loadProjects = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/story/projects");
      if (!response.ok) throw new Error("Project list request failed");
      const payload = await response.json() as { projects?: Project[] };
      setProjects(payload.projects ?? []);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);
  const groups = useMemo(() => partitionMyProjects(projects), [projects]);
  const visibleProjects = tab === "completed" ? groups.completed : groups.inProgress;

  return <ProtectedRoute><ScreenLayout eyebrow="My Projects" title="Your story projects" description="Resume Guided or Custom stories, or watch a completed browser preview. Final MP4 export is not included." maxWidth="max-w-5xl">
    <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Project status">
      {(["in-progress", "completed"] as Tab[]).map((nextTab) => <button key={nextTab} type="button" role="tab" aria-selected={tab === nextTab} onClick={() => setTab(nextTab)} className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${tab === nextTab ? "bg-gradient-to-r from-aurora to-gold text-slate-950" : "border border-white/15 bg-white/5 text-white/80 hover:border-gold/30"}`}>
        {nextTab === "in-progress" ? `In Progress (${groups.inProgress.length})` : `Completed (${groups.completed.length})`}
      </button>)}
    </div>
    {state === "loading" ? <div role="status" aria-live="polite" className="glass-panel rounded-[1.5rem] p-6 text-sm text-white/75"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading your saved Guided and Custom projects…</div> : null}
    {state === "error" ? <div role="alert" className="glass-panel rounded-[1.5rem] border-red-400/35 bg-red-500/15 p-6 text-red-100">Could not load your saved projects. <button type="button" onClick={() => void loadProjects()} className="ml-2 underline">Try again</button></div> : null}
    {state === "ready" && visibleProjects.length === 0 ? <div className="glass-panel rounded-[1.5rem] p-8 text-center"><h2 className="text-xl font-semibold text-white">{tab === "completed" ? "No completed projects yet" : "No projects in progress"}</h2><p className="mt-2 text-sm text-white/75">{tab === "completed" ? "Mark a fully prepared project complete when its required media is ready." : "Create a Guided or Custom story to see it here."}</p></div> : null}
    {state === "ready" && visibleProjects.length > 0 ? <div className="grid gap-4">{visibleProjects.map((project) => <ProjectCard key={project.id} project={project} completed={tab === "completed"} onComplete={() => void loadProjects()} />)}</div> : null}
  </ScreenLayout></ProtectedRoute>;
}
