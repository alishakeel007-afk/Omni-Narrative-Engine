// Choice impact and stat modification engine

import type { HealthStatus, StorySetupData } from '@/types/story';
import { clampHealthStat } from './game-over';

export type ChoiceStyle = 'aggressive' | 'careful' | 'magical' | 'social' | 'neutral';
export type ImpactType = 'health' | 'mana' | 'resolve' | 'inventory' | 'attribute';

export interface StatModifier {
  type: ImpactType;
  stat?: keyof HealthStatus | keyof StorySetupData['characterAttributes'];
  amount: number;
  reason: string;
  notification: string;
}

export interface ChoiceImpact {
  style: ChoiceStyle;
  modifiers: StatModifier[];
  narrativeShift?: string;
}

/**
 * Analyzes choice text and determines style
 */
export function analyzeChoiceStyle(choiceText: string): ChoiceStyle {
  const lower = choiceText.toLowerCase();

  // Aggressive/risky keywords
  if (/(attack|fight|rush|charge|strike|aggressive|bold|dangerous|risky|assault|confront)/.test(lower)) {
    return 'aggressive';
  }

  // Careful/cautious keywords
  if (/(careful|inspect|study|listen|hide|observe|cautious|quiet|sneak|investigate|wait)/.test(lower)) {
    return 'careful';
  }

  // Magical/supernatural keywords
  if (/(spell|magic|enchant|ritual|summon|curse|mystical|ancient|gate|power|force)/.test(lower)) {
    return 'magical';
  }

  // Social/diplomatic keywords
  if (/(talk|negotiate|convince|charm|diplomacy|speak|befriend|explain|reason|persuade)/.test(lower)) {
    return 'social';
  }

  return 'neutral';
}

/**
 * Determines stat impacts based on choice style and context
 */
export function calculateChoiceImpact(
  style: ChoiceStyle,
  currentHealth: HealthStatus,
  sceneContext?: string
): ChoiceImpact {
  const modifiers: StatModifier[] = [];

  switch (style) {
    case 'aggressive':
      // Aggressive choices: risk health for success
      if (currentHealth.health > 40) {
        modifiers.push({
          type: 'health',
          stat: 'health',
          amount: -15,
          reason: 'Combat risk',
          notification: 'You took damage in the confrontation (-15 HP)'
        });
      } else {
        // If already low, penalty is higher
        modifiers.push({
          type: 'health',
          stat: 'health',
          amount: -25,
          reason: 'Desperate combat',
          notification: 'You were severely wounded (-25 HP)'
        });
      }

      modifiers.push({
        type: 'health',
        stat: 'resolve',
        amount: +10,
        reason: 'Bold action',
        notification: 'Your courage increased (+10 Resolve)'
      });

      modifiers.push({
        type: 'inventory',
        amount: 1,
        reason: 'Looted from victory',
        notification: 'You found a valuable item'
      });
      break;

    case 'careful':
      // Careful choices: preserve health, use resolve
      modifiers.push({
        type: 'health',
        stat: 'health',
        amount: +5,
        reason: 'Cautious approach reduced risk',
        notification: 'Your cautious approach kept you safe (+5 HP recovery)'
      });

      modifiers.push({
        type: 'health',
        stat: 'resolve',
        amount: -5,
        reason: 'Slow progress',
        notification: 'Time and hesitation weigh on you (-5 Resolve)'
      });

      modifiers.push({
        type: 'inventory',
        amount: 1,
        reason: 'Discovered while exploring',
        notification: 'You discovered something useful'
      });
      break;

    case 'magical':
      // Magical choices: consume mana, gain resolve
      if (currentHealth.mana > 30) {
        modifiers.push({
          type: 'health',
          stat: 'mana',
          amount: -30,
          reason: 'Spell cast',
          notification: 'You cast a powerful spell (-30 Mana)'
        });

        modifiers.push({
          type: 'health',
          stat: 'resolve',
          amount: +15,
          reason: 'Magical success',
          notification: 'The magic worked! Your resolve strengthened (+15 Resolve)'
        });
      } else {
        // Not enough mana
        modifiers.push({
          type: 'health',
          stat: 'mana',
          amount: -20,
          reason: 'Desperate spell',
          notification: 'You barely had enough mana (-20 Mana)'
        });

        modifiers.push({
          type: 'health',
          stat: 'health',
          amount: -10,
          reason: 'Magical backlash',
          notification: 'The spell backfired! (-10 HP)'
        });
      }
      break;

    case 'social':
      // Social choices: restore resolve, risky
      modifiers.push({
        type: 'health',
        stat: 'resolve',
        amount: +20,
        reason: 'Successful negotiation',
        notification: 'Your words had power. You feel encouraged (+20 Resolve)'
      });

      modifiers.push({
        type: 'health',
        stat: 'mana',
        amount: +5,
        reason: 'Reduced tension',
        notification: 'Your calm approach restored some energy (+5 Mana)'
      });
      break;

    case 'neutral':
      // Neutral choices: minimal impact
      modifiers.push({
        type: 'health',
        stat: 'resolve',
        amount: +2,
        reason: 'Progressing forward',
        notification: 'You move forward (+2 Resolve)'
      });
      break;
  }

  return {
    style,
    modifiers,
    narrativeShift: `The ${style} approach you took shaped the story's direction.`
  };
}

/**
 * Applies all modifiers to health status and attributes
 */
export function applyStatModifiers(
  health: HealthStatus,
  attributes: StorySetupData['characterAttributes'],
  modifiers: StatModifier[]
): {
  updatedHealth: HealthStatus;
  updatedAttributes: StorySetupData['characterAttributes'];
  appliedModifiers: StatModifier[];
} {
  const updatedHealth = { ...health };
  const updatedAttributes = { ...attributes };
  const appliedModifiers: StatModifier[] = [];

  for (const modifier of modifiers) {
    if (modifier.type === 'health' && modifier.stat && modifier.stat in health) {
      const key = modifier.stat as keyof HealthStatus;
      const currentValue = updatedHealth[key];
      const newValue = clampHealthStat(currentValue + modifier.amount);

      if (newValue !== currentValue) {
        updatedHealth[key] = newValue;
        appliedModifiers.push(modifier);
      }
    } else if (modifier.type === 'attribute' && modifier.stat && modifier.stat in attributes) {
      const key = modifier.stat as keyof typeof attributes;
      const currentValue = updatedAttributes[key];
      const newValue = clampHealthStat(currentValue + modifier.amount);

      if (newValue !== currentValue) {
        updatedAttributes[key] = newValue;
        appliedModifiers.push(modifier);
      }
    } else if (modifier.type === 'inventory') {
      // Inventory handled separately
      appliedModifiers.push(modifier);
    }
  }

  return {
    updatedHealth,
    updatedAttributes,
    appliedModifiers
  };
}

/**
 * Generates narrative description of stat changes
 */
export function generateStatChangeNarrative(modifiers: StatModifier[]): string[] {
  return modifiers
    .filter(m => m.notification)
    .map(m => m.notification);
}

/**
 * Determines if choice is particularly risky or safe
 */
export function assessChoiceRisk(
  style: ChoiceStyle,
  currentHealth: HealthStatus
): {
  riskLevel: 'safe' | 'moderate' | 'risky' | 'critical';
  healthAfterChoice: number;
} {
  let healthAfterChoice = currentHealth.health;

  if (style === 'aggressive') {
    healthAfterChoice = clampHealthStat(healthAfterChoice - 15);
  } else if (style === 'careful') {
    healthAfterChoice = clampHealthStat(healthAfterChoice + 5);
  }

  let riskLevel: 'safe' | 'moderate' | 'risky' | 'critical' = 'moderate';

  if (healthAfterChoice < 20) {
    riskLevel = 'critical';
  } else if (healthAfterChoice < 40) {
    riskLevel = 'risky';
  } else if (healthAfterChoice > 70) {
    riskLevel = 'safe';
  }

  return {
    riskLevel,
    healthAfterChoice
  };
}
