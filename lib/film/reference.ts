import type { StudioScene, StudioState, StudioTake } from "@/types/studio";
import { continuityProblem } from "@/lib/studio/identity";

export function referenceTakeProblem(state: StudioState, scene: StudioScene, take: StudioTake) {
  if (take.kind !== "image" || take.status !== "complete" || !take.url)
    return "Wait for the reference image to finish before using it.";
  const problem = continuityProblem(state, scene, take);
  if (problem) return problem;
  if (take.continuity?.status !== "passed")
    return take.continuity?.status === "failed"
      ? "This image does not match the scene or character profile. Regenerate the image before generating video."
      : "Check this reference image against the scene and character profile before using it.";
}

export function sceneReferenceProblem(state: StudioState, scene: StudioScene) {
  const image = scene.takes.find(take => take.id === scene.selectedImageId && take.kind === "image");
  return image
    ? referenceTakeProblem(state, scene, image)
    : "Generate a reference image first, then choose Use this reference after its checks pass. Video generation needs an approved scene image.";
}
