// Adaptive difficulty system that adjusts challenge dynamically

export type DifficultyLevel = "Easy" | "Normal" | "Hard" | "Adaptive";

export interface DifficultyMetrics {
  playerSuccessRate: number; // 0-1
  choicesWithoutDamage: number;
  totalChoicesMade: number;
  averageChoiceRiskiness: number; // 0-1
  lastDifficultyAdjustment: string;
  scenesCompletedAtCurrentDifficulty: number;
}

export interface DifficultyState {
  currentLevel: DifficultyLevel;
  metrics: DifficultyMetrics;
  adjustmentHistory: {
    timestamp: string;
    from: DifficultyLevel;
    to: DifficultyLevel;
    reason: string;
  }[];
}

/**
 * Calculates player skill/performance rating
 */
export function calculatePerformanceRating(metrics: DifficultyMetrics): number {
  // Success rate: 50% weight
  const successScore = metrics.playerSuccessRate * 0.5;

  // Risk-taking behavior: 30% weight (cautious vs aggressive)
  const riskScore = metrics.averageChoiceRiskiness * 0.3;

  // Consistency (choices without damage): 20% weight
  const consistencyScore =
    metrics.choicesWithoutDamage > 0
      ? Math.min(1, metrics.choicesWithoutDamage / metrics.totalChoicesMade) * 0.2
      : 0;

  return successScore + riskScore + consistencyScore;
}

/**
 * Determines if difficulty should be adjusted
 */
export function shouldAdjustDifficulty(
  metrics: DifficultyMetrics,
  currentLevel: DifficultyLevel
): {
  shouldAdjust: boolean;
  recommendation: DifficultyLevel | null;
  reason: string;
} {
  // Need minimum data
  if (metrics.totalChoicesMade < 5) {
    return {
      shouldAdjust: false,
      recommendation: null,
      reason: "Not enough data to adjust"
    };
  }

  const performanceRating = calculatePerformanceRating(metrics);

  // Very high performance (>0.75)
  if (performanceRating > 0.75 && metrics.playerSuccessRate > 0.8) {
    if (currentLevel !== "Hard" && currentLevel !== "Adaptive") {
      return {
        shouldAdjust: true,
        recommendation: currentLevel === "Easy" ? "Normal" : "Hard",
        reason: "Player is performing exceptionally well"
      };
    }
  }

  // High performance (0.6-0.75)
  if (performanceRating > 0.6 && performanceRating <= 0.75) {
    if (currentLevel === "Easy") {
      return {
        shouldAdjust: true,
        recommendation: "Normal",
        reason: "Player is handling easy difficulty well"
      };
    }
  }

  // Low performance (<0.4)
  if (performanceRating < 0.4 && metrics.playerSuccessRate < 0.5) {
    if (currentLevel !== "Easy") {
      return {
        shouldAdjust: true,
        recommendation: currentLevel === "Hard" ? "Normal" : "Easy",
        reason: "Player is struggling with current difficulty"
      };
    }
  }

  // Very low performance (<0.2)
  if (performanceRating < 0.2) {
    return {
      shouldAdjust: true,
      recommendation: "Easy",
      reason: "Player is in severe difficulty"
    };
  }

  return {
    shouldAdjust: false,
    recommendation: null,
    reason: "Current difficulty is appropriate"
  };
}

/**
 * Get difficulty multipliers for scene generation
 */
export function getDifficultyMultipliers(difficulty: DifficultyLevel): {
  enemyDamage: number;
  enemyHealth: number;
  rewardValue: number;
  challengeFrequency: number;
} {
  const multipliers = {
    Easy: {
      enemyDamage: 0.6,
      enemyHealth: 0.7,
      rewardValue: 1.2,
      challengeFrequency: 0.5
    },
    Normal: {
      enemyDamage: 1.0,
      enemyHealth: 1.0,
      rewardValue: 1.0,
      challengeFrequency: 1.0
    },
    Hard: {
      enemyDamage: 1.5,
      enemyHealth: 1.4,
      rewardValue: 1.5,
      challengeFrequency: 1.5
    },
    Adaptive: {
      enemyDamage: 1.0,
      enemyHealth: 1.0,
      rewardValue: 1.0,
      challengeFrequency: 1.0
    }
  };

  return multipliers[difficulty];
}

/**
 * Update metrics after a choice/scene
 */
export function updateDifficultyMetrics(
  metrics: DifficultyMetrics,
  wasSuccessful: boolean,
  choiceWasRisky: boolean,
  playerTookDamage: boolean
): DifficultyMetrics {
  const updated = { ...metrics };

  // Update success rate (exponential moving average)
  const alpha = 0.3; // smoothing factor
  updated.playerSuccessRate = wasSuccessful
    ? metrics.playerSuccessRate * (1 - alpha) + 1.0 * alpha
    : metrics.playerSuccessRate * (1 - alpha) + 0.0 * alpha;

  // Track choices without damage
  if (!playerTookDamage) {
    updated.choicesWithoutDamage += 1;
  }

  // Update total choices
  updated.totalChoicesMade += 1;

  // Update average riskiness
  updated.averageChoiceRiskiness =
    (metrics.averageChoiceRiskiness * metrics.totalChoicesMade +
      (choiceWasRisky ? 1 : 0)) /
    (metrics.totalChoicesMade + 1);

  // Increment scene counter
  updated.scenesCompletedAtCurrentDifficulty += 1;

  return updated;
}

/**
 * Apply difficulty to scene description
 */
export function applyDifficultyToScene(
  sceneDescription: string,
  difficulty: DifficultyLevel
): string {
  const multipliers = getDifficultyMultipliers(difficulty);

  let enhanced = sceneDescription;

  if (difficulty === "Hard") {
    enhanced = `[HARD MODE] ${enhanced}\n\nThe danger is palpable. Every decision carries weight.`;
  } else if (difficulty === "Easy") {
    enhanced = `[EASY MODE] ${enhanced}\n\nThe challenges are manageable. You feel confident.`;
  }

  return enhanced;
}

/**
 * Get difficulty description for UI
 */
export function getDifficultyDescription(difficulty: DifficultyLevel): string {
  const descriptions = {
    Easy: "Relaxing experience with reduced danger and challenges",
    Normal: "Balanced experience with standard challenge level",
    Hard: "Intense experience with powerful enemies and scarce resources",
    Adaptive: "Difficulty adjusts automatically based on your performance"
  };

  return descriptions[difficulty];
}

/**
 * Initialize difficulty state
 */
export function createInitialDifficultyState(startingDifficulty: DifficultyLevel): DifficultyState {
  return {
    currentLevel: startingDifficulty,
    metrics: {
      playerSuccessRate: 0.5,
      choicesWithoutDamage: 0,
      totalChoicesMade: 0,
      averageChoiceRiskiness: 0.5,
      lastDifficultyAdjustment: new Date().toISOString(),
      scenesCompletedAtCurrentDifficulty: 0
    },
    adjustmentHistory: []
  };
}

/**
 * Adjust difficulty and track history
 */
export function adjustDifficulty(
  state: DifficultyState,
  newDifficulty: DifficultyLevel,
  reason: string
): DifficultyState {
  const updated = { ...state };

  updated.adjustmentHistory.push({
    timestamp: new Date().toISOString(),
    from: state.currentLevel,
    to: newDifficulty,
    reason
  });

  updated.currentLevel = newDifficulty;
  updated.metrics.lastDifficultyAdjustment = new Date().toISOString();
  updated.metrics.scenesCompletedAtCurrentDifficulty = 0;

  return updated;
}
