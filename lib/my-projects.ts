import type { VideoProjectCompletion } from "@/lib/project-summary";

export type MyProjectsProject = {
  id: string;
  status: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "ARCHIVED";
  workflow: "story" | "video-studio" | "custom-builder";
  completion: VideoProjectCompletion;
};

/**
 * My Projects promotes the two account-owned creation workflows. Legacy
 * interactive stories retain their existing routes and Dashboard entry.
 */
export function partitionMyProjects<T extends MyProjectsProject>(projects: T[]) {
  const videoProjects = projects.filter((project) => (project.workflow === "video-studio" || project.workflow === "custom-builder") && project.status !== "ARCHIVED");
  return {
    completed: videoProjects.filter((project) => project.status === "COMPLETED" && project.completion.eligible),
    inProgress: videoProjects.filter((project) => project.status !== "COMPLETED" || !project.completion.eligible),
  };
}
