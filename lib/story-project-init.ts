/**
 * Initializes a new StoryProject + StoryDraft in the database.
 * Called once when the user finalizes their setup and clicks "Begin Story".
 * Returns { projectId, draftId } to be stored in setup for the save queue.
 */
export async function initializeStoryProject(params: {
  title: string;
  mode: "guided" | "custom";
  genres: string[];
  tones: string[];
  numberOfScenes: number;
}): Promise<{ projectId: string; draftId: string } | null> {
  try {
    const response = await fetch("/api/story/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: params.title || "Untitled Story",
        mode: params.mode === "guided" ? "GUIDED" : "CUSTOM",
        draft: {
          title: params.title || "Draft 1",
          genres: params.genres,
          tones: params.tones,
          numberOfScenes: Math.max(1, Math.min(20, params.numberOfScenes)),
        },
      }),
    });

    if (!response.ok) {
      console.warn("[initializeStoryProject] API returned", response.status);
      return null;
    }

    const data = await response.json() as { project?: { id: string; drafts?: { id: string }[] } };
    const project = data.project;
    const draft = project?.drafts?.[0];

    if (!project?.id || !draft?.id) {
      console.warn("[initializeStoryProject] Unexpected response shape:", data);
      return null;
    }

    return { projectId: project.id, draftId: draft.id };
  } catch (err) {
    // Non-critical: if DB init fails, gameplay continues without persistence
    console.error("[initializeStoryProject] Failed:", err);
    return null;
  }
}
