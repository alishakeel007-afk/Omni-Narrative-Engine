export function evaluateCharacterRuntimeUpdate(params: {
  existingAppearance: string | null;
  lastSeenScene: number | null;
  nextSceneNumber?: number;
}) {
  const isCurrentOrNewer = params.nextSceneNumber === undefined
    || params.lastSeenScene === null
    || params.nextSceneNumber >= params.lastSeenScene;

  return {
    canUpdateState: isCurrentOrNewer,
    canSetAppearance: isCurrentOrNewer && !params.existingAppearance,
  };
}
