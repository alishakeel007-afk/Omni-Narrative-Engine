import type { StudioState } from "@/types/studio";

/** Excludes navigation, queue polling, and export history itself. */
export function exportSignature(state: StudioState) {
  return JSON.stringify({ title: state.title, clips: state.clips ?? [], timeline: state.timeline, edits: state.edits });
}
