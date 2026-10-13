// Game over and failure state logic

export type GameOverReason = 
  | 'DEATH' 
  | 'DESPAIR' 
  | 'EXHAUSTION' 
  | 'MADNESS'
  | 'TIME_LIMIT'
  | 'PLAYER_QUIT';

export type GameState = 'active' | 'victory' | 'defeat' | 'paused';

export interface GameOverState {
  reason: GameOverReason;
  message: string;
  finalStats: {
    scenesCompleted: number;
    choicesMade: number;
    itemsCollected: number;
    timeElapsed: number;
  };
  canRestart: boolean;
  canLoadPrevious: boolean;
  timestamp: string;
}

export interface StateCheckResult {
  isGameOver: boolean;
  gameOverState?: GameOverState;
  warnings: string[];
}

import type { HealthStatus } from '@/types/story';

/**
 * Checks if game should end based on current health status
 */
export function checkGameOverCondition(
  health: HealthStatus,
  sceneNumber: number,
  startTime: number
): StateCheckResult {
  const warnings: string[] = [];
  let gameOverState: GameOverState | undefined;

  // Death condition
  if (health.health <= 0) {
    gameOverState = {
      reason: 'DEATH',
      message: 'Your character has fallen. The story ends here.',
      finalStats: {
        scenesCompleted: sceneNumber,
        choicesMade: 0,
        itemsCollected: 0,
        timeElapsed: Date.now() - startTime
      },
      canRestart: true,
      canLoadPrevious: true,
      timestamp: new Date().toISOString()
    };
  }

  // Despair condition
  if (health.resolve <= 0 && !gameOverState) {
    gameOverState = {
      reason: 'DESPAIR',
      message: 'Your resolve has broken. You can no longer continue.',
      finalStats: {
        scenesCompleted: sceneNumber,
        choicesMade: 0,
        itemsCollected: 0,
        timeElapsed: Date.now() - startTime
      },
      canRestart: true,
      canLoadPrevious: true,
      timestamp: new Date().toISOString()
    };
  }

  // Exhaustion warning (not game over, but critical)
  if (health.mana < 20 && health.health < 30 && !gameOverState) {
    warnings.push('You are critically weakened. One more mistake could be fatal.');
  }

  // Critical health warning
  if (health.health < 30 && health.health > 0) {
    warnings.push('Your health is critically low!');
  }

  // Low resolve warning
  if (health.resolve < 30 && health.resolve > 0) {
    warnings.push('Your resolve is wavering. Caution is advised.');
  }

  return {
    isGameOver: !!gameOverState,
    gameOverState,
    warnings
  };
}

/**
 * Validates state integrity and recovers from corruption
 */
export function validateStateIntegrity(state: any): {
  isValid: boolean;
  recoveredState?: any;
  errors: string[];
} {
  const errors: string[] = [];

  if (!state) {
    return {
      isValid: false,
      errors: ['State is null or undefined']
    };
  }

  // Validate health status
  if (state.healthStatus) {
    const { health, mana, resolve } = state.healthStatus;
    
    if (typeof health !== 'number' || health < 0 || health > 100) {
      errors.push(`Invalid health value: ${health}`);
      state.healthStatus.health = Math.max(0, Math.min(100, health || 50));
    }

    if (typeof mana !== 'number' || mana < 0 || mana > 100) {
      errors.push(`Invalid mana value: ${mana}`);
      state.healthStatus.mana = Math.max(0, Math.min(100, mana || 50));
    }

    if (typeof resolve !== 'number' || resolve < 0 || resolve > 100) {
      errors.push(`Invalid resolve value: ${resolve}`);
      state.healthStatus.resolve = Math.max(0, Math.min(100, resolve || 50));
    }
  }

  // Validate inventory
  if (!Array.isArray(state.inventory)) {
    errors.push('Inventory is not an array');
    state.inventory = [];
  }

  // Validate scene number
  if (typeof state.currentSceneIndex !== 'number' || state.currentSceneIndex < 0) {
    errors.push('Invalid scene index');
    state.currentSceneIndex = 0;
  }

  return {
    isValid: errors.length === 0,
    recoveredState: errors.length > 0 ? state : undefined,
    errors
  };
}

/**
 * Clamps a stat value between 0 and 100
 */
export function clampHealthStat(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Gets game state indicator based on health
 */
export function getGameState(health: HealthStatus): GameState {
  if (health.health <= 0) return 'defeat';
  if (health.resolve <= 0) return 'defeat';
  return 'active';
}
