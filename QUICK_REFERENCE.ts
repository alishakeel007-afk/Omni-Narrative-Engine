// Quick Reference Guide - New Systems in Omni-Narrative Engine

/**
 * GAME OVER SYSTEM
 * ================
 * File: lib/game-over.ts
 * 
 * Use in StoryContext:
 * ```
 * import { checkGameOverCondition } from '@/lib/game-over';
 * 
 * const gameOverCheck = checkGameOverCondition(
 *   state.healthStatus,
 *   state.currentSceneIndex,
 *   Date.now()
 * );
 * 
 * if (gameOverCheck.isGameOver) {
 *   // Show GameOverScreen with gameOverCheck.gameOverState
 * }
 * ```
 * 
 * Failure Conditions:
 * - Health ≤ 0: Death
 * - Resolve ≤ 0: Despair
 * - Early exhaustion detection: Warning
 * - Madness threshold: Imminent game over
 * - Time limit exceeded: Long sessions
 * - Player quit: User action
 */

/**
 * CHOICE IMPACT SYSTEM
 * ====================
 * File: lib/choice-impact.ts
 * 
 * Use in StoryContext:
 * ```
 * import { 
 *   analyzeChoiceStyle,
 *   calculateChoiceImpact,
 *   applyStatModifiers
 * } from '@/lib/choice-impact';
 * 
 * const style = analyzeChoiceStyle("I attack the dragon");
 * // Returns: "aggressive" | "careful" | "magical" | "social" | "neutral"
 * 
 * const impact = calculateChoiceImpact(style, currentHealth);
 * // impact.modifiers = [{type, stat, amount, reason, notification}]
 * 
 * const { updatedHealth, appliedModifiers } = applyStatModifiers(
 *   currentHealth,
 *   attributes,
 *   impact.modifiers
 * );
 * ```
 * 
 * Stat Changes by Style:
 * - aggressive: -15 HP, +10 resolve, +1 item reward
 * - careful: +5 HP, -5 resolve, +1 item
 * - magical: -30 mana, +15 resolve (or -20 mana, -10 HP if backfire)
 * - social: +20 resolve, +5 mana
 * - neutral: +2 resolve
 */

/**
 * INPUT VALIDATION SYSTEM
 * =======================
 * File: lib/validation.ts
 * 
 * Use in forms:
 * ```
 * import { validateChoiceInput, getFirstErrorMessage } from '@/lib/validation';
 * 
 * const validation = validateChoiceInput(userInput);
 * if (!validation.isValid) {
 *   const error = getFirstErrorMessage(validation.errors);
 *   setError(error); // Show to user
 *   return;
 * }
 * ```
 * 
 * Available Validators:
 * - validateCharacterName(): 2-50 chars
 * - validateStoryTitle(): 3-100 chars
 * - validateGenre() / validateMood(): Enum checking
 * - validateChoiceInput(): 3-300 chars
 * - validateStorySetup(): Comprehensive validation
 */

/**
 * INVENTORY MANAGEMENT
 * ====================
 * File: lib/inventory.ts
 * 
 * Use for item tracking:
 * ```
 * import { InventoryManager, createDefaultItems } from '@/lib/inventory';
 * 
 * const inventory = new InventoryManager(
 *   state.inventory,
 *   { maxSlots: 20, maxWeight: 50 }
 * );
 * 
 * // Add item
 * const result = inventory.addItem(newItem);
 * if (!result.success) {
 *   console.log(result.error); // "Inventory is full"
 * }
 * 
 * // Check status
 * const status = inventory.getStatus();
 * // {itemCount, filledSlots, maxSlots, totalWeight, maxWeight, isFull}
 * ```
 * 
 * Constraints:
 * - 20 item slots maximum
 * - 50kg weight limit
 * - Stack sizes vary per item
 * - No duplicates option
 */

/**
 * ADAPTIVE DIFFICULTY
 * ===================
 * File: lib/adaptive-difficulty.ts
 * 
 * Use for dynamic challenge:
 * ```
 * import {
 *   createInitialDifficultyState,
 *   updateDifficultyMetrics,
 *   shouldAdjustDifficulty
 * } from '@/lib/adaptive-difficulty';
 * 
 * const diffState = createInitialDifficultyState("Normal");
 * 
 * // After each choice
 * diffState.metrics = updateDifficultyMetrics(
 *   diffState.metrics,
 *   wasSuccessful,
 *   wasRisky,
 *   playerTookDamage
 * );
 * 
 * // Check for adjustment
 * const { shouldAdjust, recommendation } = shouldAdjustDifficulty(
 *   diffState.metrics,
 *   diffState.currentLevel
 * );
 * ```
 * 
 * Difficulty Levels:
 * - Easy: 0.6x enemy damage, 1.2x rewards
 * - Normal: 1.0x baseline
 * - Hard: 1.5x enemy damage, 1.5x rewards
 * - Adaptive: Auto-adjusts based on performance
 */

/**
 * ACCESSIBILITY & UX
 * ==================
 * File: lib/ux-accessibility.ts
 * 
 * Use for better UX:
 * ```
 * import {
 *   usePreventDoubleClick,
 *   useDebounce,
 *   createAriaAnnouncement,
 *   announceStatChange
 * } from '@/lib/ux-accessibility';
 * 
 * // Prevent double-click
 * const { preventDoubleClick, isProcessing } = usePreventDoubleClick();
 * <button disabled={isProcessing} onClick={() => preventDoubleClick(onClick)}>
 * 
 * // Debounce input
 * const debouncedSearch = useDebounce(search, 300);
 * 
 * // Announce to screen readers
 * announceStatChange("Health", -15);
 * createAriaAnnouncement("Scene generated", "polite");
 * ```
 * 
 * Features:
 * - Double-click prevention
 * - Debounce for rapid inputs
 * - ARIA live regions
 * - Keyboard navigation helpers
 * - Focus management
 */

/**
 * SESSION STORAGE & RECOVERY
 * ==========================
 * File: lib/session-storage.ts
 * 
 * Use for auto-save:
 * ```
 * import {
 *   createAutoSaveTimer,
 *   saveRecoveryPoint,
 *   shouldAttemptRecovery,
 *   getLatestRecoveryPoint
 * } from '@/lib/session-storage';
 * 
 * // Start auto-save
 * useEffect(() => {
 *   const cleanup = createAutoSaveTimer(
 *     () => saveRecoveryPoint(state),
 *     30000 // Save every 30 seconds
 *   );
 *   return cleanup;
 * }, [state]);
 * 
 * // Check for recovery on app load
 * if (shouldAttemptRecovery()) {
 *   const point = getLatestRecoveryPoint();
 *   // Offer to recover from point.timestamp
 * }
 * ```
 * 
 * Features:
 * - Auto-save with configurable interval
 * - Last 5 recovery points maintained
 * - State hashing for integrity
 * - Automatic cleanup (7 days old)
 * - Export/import as JSON
 */

/**
 * ERROR HANDLING
 * ==============
 * File: components/error-boundary.tsx, screens/ErrorScreen.tsx
 * 
 * Use in pages:
 * ```
 * import { ErrorBoundary } from '@/components/error-boundary';
 * 
 * <ErrorBoundary>
 *   <YourPage />
 * </ErrorBoundary>
 * ```
 * 
 * Use in API calls:
 * ```
 * import ErrorScreen from '@/screens/ErrorScreen';
 * 
 * try {
 *   const data = await fetch(...);
 * } catch (error) {
 *   return <ErrorScreen errorType="network" message={error.message} />;
 * }
 * ```
 * 
 * Error Types:
 * - network: Connection issues
 * - rate-limit: API throttled (429)
 * - session: Authentication expired (401)
 * - server: Server error (500)
 * - unknown: Generic error
 */

/**
 * LOADING STATES
 * ==============
 * File: components/loading-state.tsx
 * 
 * Use for consistent loading:
 * ```
 * import { LoadingIndicator, useLoadingState } from '@/components/loading-state';
 * 
 * const { isLoading, withLoading } = useLoadingState();
 *
 * <LoadingIndicator isLoading={isLoading} type="scene" />
 * 
 * // Use in async operations
 * await withLoading(generateScene);
 * ```
 * 
 * Available Components:
 * - LoadingIndicator: Inline indicator with message
 * - LoadingOverlay: Full-screen overlay
 * - SceneCardSkeleton(): Placeholder for cards
 * - MiniLoadingIndicator: Icon-only spinner
 */

/**
 * TOAST NOTIFICATIONS
 * ===================
 * File: components/toast.tsx
 * 
 * Use for notifications:
 * ```
 * import { useToasts, createStatChangeToast } from '@/components/toast';
 * 
 * const { toasts, addToast, removeToast } = useToasts();
 * 
 * // Add notification
 * addToast(createStatChangeToast("Health", -15));
 * 
 * // Render container
 * <ToastContainer toasts={toasts} onDismiss={removeToast} />
 * ```
 * 
 * Toast Types:
 * - success: Green, checkmark
 * - error: Red, alert
 * - info: Blue, info
 * - warning: Yellow, warning
 */

/**
 * EMPTY STATES
 * ============
 * File: components/empty-state.tsx
 * 
 * Use in screens:
 * ```
 * import { EmptyMemoryState } from '@/components/empty-state';
 * 
 * {memoryTimeline.length === 0 && <EmptyMemoryState />}
 * 
 * // Or generic
 * <EmptyState
 *   type="stories"
 *   actionLabel="Create Story"
 *   actionHref="/dashboard/create"
 * />
 * ```
 * 
 * States:
 * - memory: No story memory yet
 * - inventory: Inventory empty
 * - history: No story history
 * - stories: No stories found
 * - generic: Customizable
 */

/**
 * CONFIRMATION DIALOGS
 * ====================
 * File: components/confirmation-dialog.tsx
 * 
 * Use for destructive actions:
 * ```
 * import { useConfirmation } from '@/components/confirmation-dialog';
 * 
 * const { open, confirm, dialog } = useConfirmation();
 * 
 * // Show dialog
 * const confirmed = await confirm({
 *   title: "Delete story?",
 *   message: "This cannot be undone",
 *   type: "delete"
 * });
 * 
 * if (confirmed) {
 *   await deleteStory();
 * }
 * 
 * // Render
 * {dialog}
 * ```
 * 
 * Dialog Types:
 * - delete: Destructive, red confirm
 * - exit: Logout action
 * - reset: Reset action, orange
 * - generic: Custom action
 */

/**
 * TESTING & VERIFICATION
 * ======================
 * File: lib/test-utils.ts
 * 
 * Run in browser console:
 * ```
 * // Test all systems
 * import { runAllTests } from '@/lib/test-utils';
 * runAllTests();
 * // Output: ✅ All tests passed!
 * 
 * // Test performance
 * import { performanceTest } from '@/lib/test-utils';
 * performanceTest();
 * 
 * // Simulate gameplay
 * import { simulateGameSession } from '@/lib/test-utils';
 * simulateGameSession();
 * ```
 * 
 * Tests:
 * - Game over detection
 * - Choice impact calculation
 * - Input validation
 * - Inventory constraints
 * - Adaptive difficulty
 * - Performance benchmarks
 * - End-to-end simulation
 */

// ============================================================================
// INTEGRATION QUICKSTART
// ============================================================================

// 1. In StoryContext.tsx (DONE)
import { checkGameOverCondition } from '@/lib/game-over';
import { analyzeChoiceStyle, calculateChoiceImpact, applyStatModifiers } from '@/lib/choice-impact';
import { validateChoiceInput } from '@/lib/validation';

// 2. In screens (TO DO)
import GameOverScreen from '@/screens/GameOverScreen';
import ErrorScreen from '@/screens/ErrorScreen';
import { EmptyMemoryState } from '@/components/empty-state';

// 3. In components (TO DO)
import { LoadingIndicator } from '@/components/loading-state';
import { ErrorBoundary } from '@/components/error-boundary';
import { useConfirmation } from '@/components/confirmation-dialog';
import { useToasts, ToastContainer } from '@/components/toast';

// 4. In event handlers (TO DO)
import { usePreventDoubleClick } from '@/lib/ux-accessibility';
import { createAutoSaveTimer } from '@/lib/session-storage';
