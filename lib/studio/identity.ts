import type {
  StudioCharacter,
  StudioIdentity,
  StudioScene,
  StudioState,
  StudioTake,
} from "@/types/studio";
import { clipSeconds } from "@/lib/film/duration";
import { precedingSceneContext } from "@/lib/film/prompt";

export function characterReferences(character: StudioCharacter) {
  const refs = [...(character.references || [])];
  if (
    character.referenceId &&
    !refs.some((item) => item.id === character.referenceId)
  )
    refs.unshift({ id: character.referenceId, label: "Primary" });
  return refs.sort(
    (a, b) =>
      Number(b.id === character.referenceId) -
      Number(a.id === character.referenceId),
  );
}
export function identityProfile(character: StudioCharacter): StudioIdentity {
  const referenceIds = characterReferences(character).map((item) => item.id);
  return {
    characterId: character.id,
    name: character.name,
    appearance: character.appearance,
    referenceIds,
    key: JSON.stringify({
      name: character.name,
      appearance: character.appearance,
      locked: character.locked,
      referenceIds,
    }),
  };
}
export function conditioningReferences(
  identities: StudioIdentity[],
  limit = 6,
) {
  if (identities.length > limit)
    throw new Error(
      `Generate smaller groups: this image backend supports ${limit} character inputs per shot.`,
    );
  const refs: string[] = [];
  for (let view = 0; view < 6 && refs.length < limit; view++)
    for (const identity of identities) {
      const ref = identity.referenceIds[view];
      if (ref && !refs.includes(ref)) refs.push(ref);
      if (refs.length === limit) break;
    }
  return refs;
}
export function boundImagePrompt(request: {
  prompt: string;
  referenceIds: string[];
  identity?: StudioIdentity[];
}) {
  if (!request.identity?.length) return request.prompt;
  return `${request.prompt}\nReference input mapping (do not blend characters): ${request.referenceIds.map((id, index) => `image ${index + 1} = ${request.identity!.find((item) => item.referenceIds.includes(id))?.name || "scene reference"}`).join("; ")}. Multiple images with the same name show the same character from different views.`;
}
export function sceneIdentity(state: StudioState, scene: StudioScene) {
  return state.characters
    // A locked reference is an explicit continuity promise. Characters that
    // only have a written description are still included in the generation
    // prompt, but cannot be visually checked against an image they do not have.
    .filter((item) =>
      scene.characterIds.includes(item.id) &&
      item.locked &&
      characterReferences(item).length,
    )
    .map(identityProfile);
}
/** Written character profiles alone do not require image approval. */
export function sceneHasCharacterReferences(state: StudioState, scene: StudioScene) {
  return state.characters.some(character => scene.characterIds.includes(character.id) && characterReferences(character).length > 0);
}
export function imageReviewOverridden(state: StudioState, scene: StudioScene, take: StudioTake) {
  return take.kind === "image" && !!take.reviewOverride &&
    take.reviewOverride.sourceUrl === take.url &&
    take.reviewOverride.requirements === sceneImageRequirements(state, scene);
}
export function continuityProblem(
  state: StudioState,
  scene: StudioScene,
  take: StudioTake,
): string | undefined {
  if (
    take.stale || (scene.outdated && !take.sourceRequirements && !take.sourceImageRequirements) ||
    (take.kind === "image" && take.sourceImageRequirements
      ? take.sourceImageRequirements !== sceneImageRequirements(state, scene)
      : take.sourceRequirements && take.sourceRequirements !== sceneRequirements(state, scene))
  )
    return "This take uses an older scene or story revision. Create a new take from the current requirements.";
  const identities = sceneIdentity(state, scene);
  if (!identities.length) return;
  if (
    !take.identity ||
    JSON.stringify(take.identity.map((item) => item.key)) !==
      JSON.stringify(identities.map((item) => item.key))
  )
    return "Character references changed or this take predates consistency checks. Generate a new take.";
  if (imageReviewOverridden(state, scene, take)) return;
  if (take.continuity?.sceneCheck?.verdict === "mismatch")
    return `This ${take.kind} does not match the scene: ${take.continuity.sceneCheck.notes} ${take.kind === "image" ? "Regenerate it or choose Skip check and use this image." : "Generate a revised video from an approved reference image."}`;
  if (take.continuity?.sceneCheck?.verdict === "uncertain")
    return "The scene match could not be confirmed. Retry the check or choose another take.";
  if (take.continuity?.status !== "passed")
    return take.continuity?.status === "failed"
      ? "Appearance drift was detected. Generate a revised take."
      : "This take needs a successful appearance check before it can be selected or exported.";
}
/**
 * Everything a generated take depends on.
 *
 * A take whose requirements no longer match the scene is stale, so anything
 * that changes what the worker is asked for has to appear here. Clip length and
 * internal cuts both do: a take generated as one 5s shot is not the take a 20s
 * three-shot sequence asks for.
 */
export function sceneRequirements(state: StudioState, scene: StudioScene) {
  return JSON.stringify({
    title: state.title,
    premise: state.premise,
    world: state.world,
    visualStyle: state.visualStyle,
    creativeBrief: state.creativeBrief,
    continuityContext: precedingSceneContext(state, scene),
    // Spoken language routes to a different pipeline entirely.
    language: state.language ?? "en",
    scene: {
      id: scene.id,
      title: scene.title,
      description: scene.description,
      direction: scene.direction,
      characterIds: scene.characterIds,
      dialogues: scene.dialogues.map(({ character, text }) => ({
        character,
        text,
      })),
      // The requested length, resolved the same way generation resolves it.
      seconds: clipSeconds(scene.requestedSeconds ?? state.clipSeconds),
      requestedSeconds: scene.requestedSeconds ?? state.clipSeconds ?? 5,
      // Internal cuts, if any. Absent means one continuous shot.
      beats: scene.beats?.map(({ visualAction, dialogueIds }) => ({
        visualAction,
        dialogueIds: dialogueIds ?? [],
      })),
    },
    cast: sceneIdentity(state, scene),
  });
}

/** Changing a video's duration or dialogue does not change its opening image. */
export function sceneImageRequirements(state: StudioState, scene: StudioScene) {
  const requirements = JSON.parse(sceneRequirements(state, scene));
  delete requirements.scene.seconds;
  delete requirements.scene.requestedSeconds;
  delete requirements.scene.dialogues;
  requirements.scene.openingAction = scene.beats?.[0]?.visualAction ?? scene.visualAction ?? scene.description;
  delete requirements.scene.beats;
  return JSON.stringify(requirements);
}

/**
 * Whether a named set of scenes is fit to assemble or export.
 *
 * Takes a scene-id list rather than reading one field, so the same check serves
 * the v1 timeline, the four-step assemble step, and the clip timeline.
 */
export function sceneSetContinuityProblem(state: StudioState, sceneIds: string[]) {
  for (const id of sceneIds) {
    const scene = state.scenes.find((item) => item.id === id);
    if (!scene) return "A scene on the timeline is missing.";
    const take = scene.takes.find(
      (item) => item.id === scene.selectedVideoId && item.status === "complete",
    );
    if (!take) return `Select a completed video for ${scene.title}.`;
    const problem = continuityProblem(state, scene, take);
    if (problem) return `${scene.title}: ${problem}`;
  }
}

export function filmContinuityProblem(state: StudioState) {
  return sceneSetContinuityProblem(state, state.timeline);
}
