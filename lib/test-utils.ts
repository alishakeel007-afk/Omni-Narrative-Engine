// Test utilities for story engine systems

import { HealthStatus } from "@/lib/story-storage";
import { checkGameOverCondition } from "@/lib/game-over";
import { analyzeChoiceStyle, calculateChoiceImpact } from "@/lib/choice-impact";
import { validateChoiceInput, validateStoryTitle } from "@/lib/validation";
import { InventoryManager, createDefaultItems } from "@/lib/inventory";
import {
  createInitialDifficultyState,
  shouldAdjustDifficulty,
  updateDifficultyMetrics
} from "@/lib/adaptive-difficulty";

/**
 * Mock health status for testing
 */
export function createMockHealthStatus(
  overrides?: Partial<HealthStatus>
): HealthStatus {
  return {
    health: 100,
    mana: 100,
    resolve: 100,
    attributes: {
      strength: 50,
      intelligence: 50,
      wisdom: 50,
      charisma: 50,
      dexterity: 50
    },
    ...overrides
  };
}

/**
 * Test game over detection
 */
export function testGameOverDetection() {
  console.log("Testing game over detection...");

  // Test health <= 0
  const deadHealth = createMockHealthStatus({ health: 0 });
  const deathCheck = checkGameOverCondition(deadHealth, 5, Date.now());
  console.assert(deathCheck.isGameOver, "Should detect death at 0 health");

  // Test resolve <= 0
  const despairHealth = createMockHealthStatus({ resolve: 0 });
  const despairCheck = checkGameOverCondition(despairHealth, 5, Date.now());
  console.assert(despairCheck.isGameOver, "Should detect despair at 0 resolve");

  // Test active game
  const activeHealth = createMockHealthStatus();
  const activeCheck = checkGameOverCondition(activeHealth, 5, Date.now());
  console.assert(!activeCheck.isGameOver, "Should not detect game over with full stats");

  console.log("✓ Game over detection tests passed");
}

/**
 * Test choice impact system
 */
export function testChoiceImpacts() {
  console.log("Testing choice impact system...");

  const testCases = [
    {
      choice: "attack the monster",
      expectedStyle: "aggressive"
    },
    {
      choice: "carefully inspect the room",
      expectedStyle: "careful"
    },
    {
      choice: "cast a spell",
      expectedStyle: "magical"
    },
    {
      choice: "talk to the guard",
      expectedStyle: "social"
    }
  ];

  testCases.forEach(({ choice, expectedStyle }) => {
    const style = analyzeChoiceStyle(choice);
    console.assert(
      style === expectedStyle,
      `Choice "${choice}" should be ${expectedStyle}, got ${style}`
    );
  });

  // Test impact calculation
  const health = createMockHealthStatus();
  const impact = calculateChoiceImpact("aggressive", health);
  console.assert(impact.modifiers.length > 0, "Should have modifiers");
  console.assert(impact.style === "aggressive", "Should match style");

  console.log("✓ Choice impact tests passed");
}

/**
 * Test validation
 */
export function testValidation() {
  console.log("Testing validation...");

  // Valid choice
  const validResult = validateChoiceInput("I will attack the dragon");
  console.assert(validResult.isValid, "Valid choice should pass");

  // Too short
  const shortResult = validateChoiceInput("Hi");
  console.assert(!shortResult.isValid, "Short choice should fail");

  // Too long
  const longText = "a".repeat(301);
  const longResult = validateChoiceInput(longText);
  console.assert(!longResult.isValid, "Long choice should fail");

  // Valid title
  const titleResult = validateStoryTitle("The Great Adventure");
  console.assert(titleResult.isValid, "Valid title should pass");

  console.log("✓ Validation tests passed");
}

/**
 * Test inventory system
 */
export function testInventory() {
  console.log("Testing inventory system...");

  const inventory = new InventoryManager(createDefaultItems());

  // Check initial state
  const status = inventory.getStatus();
  console.assert(status.itemCount === 3, "Should have 3 default items");

  // Test weight
  const weight = inventory.getTotalWeight();
  console.assert(weight > 0, "Should have weight");

  // Test add item
  const newItem = {
    id: "test-1",
    name: "Test Item",
    description: "A test item",
    rarity: "common" as const,
    weight: 1,
    maxStackSize: 99,
    quantity: 1
  };

  const addResult = inventory.addItem(newItem);
  console.assert(addResult.success, "Should add item");

  // Test remove item
  const removeResult = inventory.removeItem("Test Item");
  console.assert(removeResult.success, "Should remove item");

  console.log("✓ Inventory tests passed");
}

/**
 * Test adaptive difficulty
 */
export function testAdaptiveDifficulty() {
  console.log("Testing adaptive difficulty...");

  const state = createInitialDifficultyState("Normal");
  console.assert(state.currentLevel === "Normal", "Should start at Normal");

  // Update metrics for high performance
  let metrics = state.metrics;
  metrics = updateDifficultyMetrics(metrics, true, false, false); // Success, no risk, no damage
  metrics = updateDifficultyMetrics(metrics, true, false, false);
  metrics = updateDifficultyMetrics(metrics, true, false, false);
  metrics = updateDifficultyMetrics(metrics, true, false, false);
  metrics = updateDifficultyMetrics(metrics, true, false, false);

  const adjustment = shouldAdjustDifficulty(metrics, state.currentLevel);
  console.assert(adjustment.shouldAdjust, "Should recommend difficulty increase with high performance");

  console.log("✓ Adaptive difficulty tests passed");
}

/**
 * Run all tests
 */
export function runAllTests() {
  console.log("🧪 Running story engine tests...\n");

  try {
    testGameOverDetection();
    testChoiceImpacts();
    testValidation();
    testInventory();
    testAdaptiveDifficulty();

    console.log("\n✅ All tests passed!");
    return true;
  } catch (error) {
    console.error("❌ Tests failed:", error);
    return false;
  }
}

/**
 * Performance test
 */
export function performanceTest() {
  console.log("📊 Running performance tests...\n");

  // Test choice impact calculation
  const startChoice = performance.now();
  for (let i = 0; i < 1000; i++) {
    analyzeChoiceStyle("I will cast a powerful spell");
    calculateChoiceImpact("magical", createMockHealthStatus());
  }
  const endChoice = performance.now();
  console.log(`Choice processing: ${(endChoice - startChoice).toFixed(2)}ms for 1000 operations`);

  // Test game over detection
  const startGameOver = performance.now();
  for (let i = 0; i < 1000; i++) {
    checkGameOverCondition(createMockHealthStatus(), 10, Date.now());
  }
  const endGameOver = performance.now();
  console.log(`Game over detection: ${(endGameOver - startGameOver).toFixed(2)}ms for 1000 operations`);

  // Test validation
  const startValidation = performance.now();
  for (let i = 0; i < 1000; i++) {
    validateChoiceInput("This is a test choice");
  }
  const endValidation = performance.now();
  console.log(`Validation: ${(endValidation - startValidation).toFixed(2)}ms for 1000 operations`);

  console.log("\n✅ Performance tests complete");
}

/**
 * Simulate a game session
 */
export function simulateGameSession() {
  console.log("🎮 Simulating game session...\n");

  let health = createMockHealthStatus();
  let sceneIndex = 0;
  let memory: string[] = [];

  // Simulate 5 scenes
  for (let i = 0; i < 5; i++) {
    sceneIndex++;
    console.log(`\n--- Scene ${sceneIndex} ---`);

    // Make a choice
    const choices = [
      "attack the enemy",
      "carefully observe",
      "cast a protective spell",
      "try to negotiate"
    ];
    const choice = choices[Math.floor(Math.random() * choices.length)];
    console.log(`Choice: "${choice}"`);

    // Calculate impact
    const style = analyzeChoiceStyle(choice);
    const impact = calculateChoiceImpact(style, health);

    // Apply modifiers
    const { updatedHealth, appliedModifiers } = applyStatModifiers(
      health,
      health.attributes,
      impact.modifiers
    );

    health = updatedHealth;

    // Log changes
    appliedModifiers.forEach(mod => {
      console.log(`  → ${mod.notification}`);
    });

    memory.push(`Scene ${sceneIndex}: Chose "${choice}"`);

    // Check for game over
    const gameOverCheck = checkGameOverCondition(health, sceneIndex, Date.now());
    if (gameOverCheck.isGameOver) {
      console.log(`\n☠️ GAME OVER: ${gameOverCheck.gameOverState?.reason}`);
      break;
    }
  }

  console.log(`\n✅ Simulation complete. Final health: ${health.health}`);
  return health;
}

// Import helper
function applyStatModifiers(health: any, attributes: any, modifiers: any[]) {
  return {
    updatedHealth: health,
    appliedModifiers: modifiers.map(m => ({ ...m, notification: m.reason }))
  };
}
