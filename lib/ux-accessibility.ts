// User Experience and Accessibility Utilities

import { useCallback, useRef } from "react";

/**
 * Hook to prevent double-click/rapid submissions
 */
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 500
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );
}

/**
 * Hook to prevent double-click on buttons
 */
export function usePreventDoubleClick() {
  const isProcessingRef = useRef(false);

  const preventDoubleClick = useCallback(
    async (callback: () => void | Promise<void>) => {
      if (isProcessingRef.current) {
        console.warn("Request already in progress");
        return;
      }

      isProcessingRef.current = true;

      try {
        await callback();
      } finally {
        isProcessingRef.current = false;
      }
    },
    []
  );

  const isProcessing = isProcessingRef.current;

  return { preventDoubleClick, isProcessing };
}

/**
 * ARIA utility for announcements
 */
export function createAriaAnnouncement(
  message: string,
  role: "polite" | "assertive" = "polite"
): void {
  // Remove existing announcements
  const existing = document.getElementById("aria-announcement");
  if (existing) {
    existing.remove();
  }

  // Create announcement element
  const announcement = document.createElement("div");
  announcement.id = "aria-announcement";
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", role);
  announcement.setAttribute("aria-atomic", "true");
  announcement.className = "sr-only"; // Screen reader only

  announcement.textContent = message;
  document.body.appendChild(announcement);

  // Remove after announcement is read
  setTimeout(() => {
    announcement.remove();
  }, 3000);
}

/**
 * Keyboard navigation helper
 */
export function createKeyboardHandler(
  handlers: Record<string, () => void>
): (event: React.KeyboardEvent) => void {
  return (event: React.KeyboardEvent) => {
    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  };
}

/**
 * Focus management utility
 */
export function setFocusToElement(selector: string): void {
  const element = document.querySelector(selector) as HTMLElement;
  if (element) {
    element.focus();
  }
}

/**
 * Announce game state changes for accessibility
 */
export function announceGameStateChange(
  previousState: string,
  newState: string
): void {
  if (previousState !== newState) {
    createAriaAnnouncement(
      `Game state changed from ${previousState} to ${newState}`,
      "assertive"
    );
  }
}

/**
 * Announce stat changes
 */
export function announceStatChange(statName: string, change: number): void {
  const direction = change > 0 ? "increased" : "decreased";
  const absChange = Math.abs(change);
  createAriaAnnouncement(
    `${statName} ${direction} by ${absChange}`,
    "polite"
  );
}

/**
 * Skip to main content link handler
 */
export function createSkipToMainHandler(): () => void {
  return () => {
    const main = document.querySelector("main");
    if (main) {
      main.focus();
      main.scrollIntoView({ behavior: "smooth" });
    }
  };
}

/**
 * Announce game over
 */
export function announceGameOver(reason: string): void {
  createAriaAnnouncement(`Game Over: ${reason}`, "assertive");
}

/**
 * Announce choice result
 */
export function announceChoiceResult(
  choiceText: string,
  result: string
): void {
  createAriaAnnouncement(
    `You chose: ${choiceText}. Result: ${result}`,
    "polite"
  );
}

/**
 * Track keyboard navigation
 */
export function useKeyboardNav(
  onArrowUp?: () => void,
  onArrowDown?: () => void,
  onEnter?: () => void
): Record<string, () => void> {
  return {
    ArrowUp: onArrowUp || (() => {}),
    ArrowDown: onArrowDown || (() => {}),
    Enter: onEnter || (() => {})
  };
}

/**
 * Mobile touch optimization
 */
export function makeButtonTouchFriendly(
  minSize: number = 44 // minimum recommended touch target
): string {
  return `min-h-[${minSize}px] min-w-[${minSize}px]`;
}

/**
 * Focus visible state for keyboard navigation
 */
export const focusVisibleStyles =
  "focus:outline-none focus:ring-2 focus:ring-gold focus:ring-offset-2 focus:ring-offset-slate-950";

/**
 * Get current page title for accessibility
 */
export function setPageTitle(title: string): void {
  document.title = title + " | Omni-Narrative Engine";
}
