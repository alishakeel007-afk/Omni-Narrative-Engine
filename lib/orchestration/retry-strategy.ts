/**
 * Module 7.8 – Asynchronous Processing & System Orchestration
 * Retry Strategy: Configurable strategies for handling transient failures.
 */

export type RetryStrategyType = "exponential" | "linear" | "fixed" | "none";

export type RetryStrategy = {
  type: RetryStrategyType;
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
  shouldRetry: (error: Error, attempt: number) => boolean;
};

function addJitter(delayMs: number): number {
  // Add up to 20% random jitter to prevent thundering herd
  return delayMs + Math.random() * delayMs * 0.2;
}

export function computeDelay(strategy: RetryStrategy, attempt: number): number {
  if (strategy.type === "none") return 0;

  let delay: number;

  if (strategy.type === "exponential") {
    delay = Math.min(strategy.baseDelayMs * Math.pow(2, attempt), strategy.maxDelayMs);
  } else if (strategy.type === "linear") {
    delay = Math.min(strategy.baseDelayMs * (attempt + 1), strategy.maxDelayMs);
  } else {
    // fixed
    delay = strategy.baseDelayMs;
  }

  return strategy.jitter ? addJitter(delay) : delay;
}

// ─── Built-in Retry Predicates ────────────────────────────────────────────────

/** Retry on network errors and timeouts */
export function retryOnNetworkError(error: Error, _attempt: number): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("enotfound")
  );
}

/** Retry on HTTP 429 (rate limit) and 5xx server errors */
export function retryOnServerError(error: Error, _attempt: number): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("rate limit") ||
    retryOnNetworkError(error, _attempt)
  );
}

/** Never retry (for user input validation errors) */
export function neverRetry(_error: Error, _attempt: number): boolean {
  return false;
}

// ─── Pre-built Strategies ─────────────────────────────────────────────────────

/** Default strategy for AI generation calls (Gemini/Groq) */
export const AI_GENERATION_RETRY: RetryStrategy = {
  type: "exponential",
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  jitter: true,
  shouldRetry: retryOnServerError,
};

/** Strategy for TTS/audio calls */
export const AUDIO_GENERATION_RETRY: RetryStrategy = {
  type: "exponential",
  maxRetries: 2,
  baseDelayMs: 800,
  maxDelayMs: 5000,
  jitter: true,
  shouldRetry: retryOnServerError,
};

/** No retry for deterministic operations */
export const NO_RETRY: RetryStrategy = {
  type: "none",
  maxRetries: 0,
  baseDelayMs: 0,
  maxDelayMs: 0,
  jitter: false,
  shouldRetry: neverRetry,
};
