export type DifficultyLevel = "Easy" | "Normal" | "Hard" | "Adaptive";

export function getDifficultyModifier(
  difficulty: DifficultyLevel,
  consecutiveSuccesses: number,
  consecutiveFailures: number
): string | null {
  if (difficulty !== "Adaptive" && difficulty !== "Hard") {
    return null;
  }

  // RPG Dice Roll thresholds
  const SUCCESS_THRESHOLD = 3;
  const FAILURE_THRESHOLD = 2;

  if (consecutiveSuccesses >= SUCCESS_THRESHOLD) {
    return "CRITICAL DIRECTIVE: The player is succeeding too easily. You MUST inject a severe complication, an ambush, a sudden betrayal, or a dangerous trap into this scene to challenge them.";
  }

  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    return "CRITICAL DIRECTIVE: The player is struggling severely. You MUST inject a lucky break, an unexpected ally, a moment of respite, or a helpful item into this scene to balance the difficulty.";
  }

  return null;
}
