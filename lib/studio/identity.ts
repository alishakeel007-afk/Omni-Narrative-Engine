import type {
  StudioCharacter,
  StudioIdentity,
  StudioScene,
  StudioState,
  StudioTake,
} from "@/types/studio";

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
    .filter((item) => scene.characterIds.includes(item.id))
    .map(identityProfile);
}
export function continuityProblem(
  state: StudioState,
  scene: StudioScene,
  take: StudioTake,
): string | undefined {
  if (
    take.stale ||
    (take.sourceRequirements &&
      take.sourceRequirements !== sceneRequirements(state, scene))
  )
    return "This take uses an older scene or story revision. Create a new take from the current requirements.";
  const identities = sceneIdentity(state, scene);
  if (!scene.characterIds.length) return;
  if (identities.length !== scene.characterIds.length)
    return "A scene character is missing. Update the cast first.";
  if (
    state.characters.some(
      (item) =>
        scene.characterIds.includes(item.id) &&
        (!item.locked || !characterReferences(item).length),
    )
  )
    return "Review and lock a reference for every character first.";
  if (
    !take.identity ||
    JSON.stringify(take.identity.map((item) => item.key)) !==
      JSON.stringify(identities.map((item) => item.key))
  )
    return "Character references changed or this take predates consistency checks. Generate a new take.";
  if (take.continuity?.status !== "passed")
    return take.continuity?.status === "failed"
      ? "Appearance drift was detected. Generate a revised take."
      : "This take needs a successful appearance check before it can be selected or exported.";
}
export function sceneRequirements(state: StudioState, scene: StudioScene) {
  return JSON.stringify({
    title: state.title,
    premise: state.premise,
    world: state.world,
    scene: {
      id: scene.id,
      title: scene.title,
      description: scene.description,
      characterIds: scene.characterIds,
      dialogues: scene.dialogues.map(({ character, text }) => ({
        character,
        text,
      })),
    },
    cast: sceneIdentity(state, scene),
  });
}
export function filmContinuityProblem(state: StudioState) {
  for (const id of state.timeline) {
    const scene = state.scenes.find((item) => item.id === id);
    if (!scene) return "A timeline scene is missing.";
    const take = scene.takes.find(
      (item) => item.id === scene.selectedVideoId && item.status === "complete",
    );
    if (!take) return `Select a completed video for ${scene.title}.`;
    const problem = continuityProblem(state, scene, take);
    if (problem) return `${scene.title}: ${problem}`;
  }
}
