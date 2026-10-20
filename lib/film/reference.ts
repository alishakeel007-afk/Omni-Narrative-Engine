import type { StudioScene, StudioState, StudioTake } from "@/types/studio";
import { continuityProblem, imageReviewOverridden, sceneHasCharacterReferences } from "@/lib/studio/identity";

export function referenceTakeProblem(state: StudioState, scene: StudioScene, take: StudioTake) {
  if (take.kind !== "image" || take.status !== "complete" || !take.url)
    return "Wait for the reference image to finish before using it.";
  const problem = continuityProblem(state, scene, take);
  if (problem) return problem;
  if (!sceneHasCharacterReferences(state, scene) || imageReviewOverridden(state, scene, take)) return;
  if (take.continuity?.status !== "passed")
    return take.continuity?.status === "failed"
      ? "This image does not match the scene or character profile. Regenerate it or choose Skip check and use this image."
      : "Check this reference image against the scene and character profile before using it.";
}

export function sceneReferenceProblem(state: StudioState, scene: StudioScene) {
  if (state.characters.some(character => scene.characterIds.includes(character.id) && !character.locked && (character.referenceId || character.references?.length)))
    return "Review and lock this scene's character references in Script & Characters before generating.";
  const image = scene.takes.find(take => take.id === scene.selectedImageId && take.kind === "image");
  return image
    ? referenceTakeProblem(state, scene, image)
    : sceneHasCharacterReferences(state, scene)
      ? "This scene uses an uploaded character reference. Generate a scene image first, then choose Use this reference after its checks pass, or skip the check and use the image."
      : undefined;
}
