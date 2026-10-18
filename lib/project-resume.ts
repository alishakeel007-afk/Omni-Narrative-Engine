export type PersistedProjectWorkflow = "story" | "video-studio" | "custom-builder";

/** Database projects have two supported, ownership-checked workspaces. */
export function getPersistedProjectResume(workflow: PersistedProjectWorkflow) {
  return workflow === "video-studio"
    ? { href: "/video", label: "Open Video Studio", workspace: "Video Studio" }
    : workflow === "custom-builder"
      ? { href: "/story-builder", label: "Open Custom Story Builder", workspace: "Custom Story Builder" }
    : { href: "/story/play", label: "Open Active Story", workspace: "Interactive Story" };
}

/** Custom Builder remains a separate workflow, with optional account persistence. */
export function getCustomBuilderResume(isPreviewReady: boolean) {
  return isPreviewReady
    ? { href: "/video-preview?mode=custom", label: "Open Custom Story Preview" }
    : { href: "/story-builder", label: "Resume Custom Scene Builder" };
}
