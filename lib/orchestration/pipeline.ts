/**
 * Module 7.8 – Asynchronous Processing & System Orchestration
 * Pipeline: Multi-step workflow executor with hooks for future module integration.
 */

import { eventBus } from "./event-bus";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PipelineContext = {
  pipelineId: string;
  pipelineName: string;
  input: unknown;
  results: Map<string, unknown>;
  meta: Map<string, unknown>;
  setMeta: (key: string, value: unknown) => void;
  getMeta: (key: string) => unknown;
};

export type PipelineStep<TInput = unknown, TOutput = unknown> = {
  name: string;
  execute: (input: TInput, context: PipelineContext) => Promise<TOutput>;
  /**
   * If true, failure of this step aborts the pipeline.
   * If false, failure is logged and the pipeline continues.
   * Default: true
   */
  critical?: boolean;
};

export type PipelineHooks = {
  /** Called before each step. Return false to skip the step. */
  onBeforeStep?: (stepName: string, context: PipelineContext) => Promise<boolean | void>;
  /** Called after each successful step. Can modify context via setMeta. */
  onAfterStep?: (stepName: string, result: unknown, context: PipelineContext) => Promise<void>;
  /** Called when all steps complete successfully. */
  onPipelineComplete?: (context: PipelineContext) => Promise<void>;
  /** Called when a critical step fails. */
  onPipelineError?: (error: Error, failedStep: string, context: PipelineContext) => Promise<void>;
};

export type PipelineDefinition = {
  name: string;
  steps: PipelineStep[];
  hooks?: PipelineHooks;
};

export type PipelineResult<T = unknown> = {
  success: boolean;
  results: Map<string, unknown>;
  finalResult?: T;
  error?: string;
  failedStep?: string;
};

// ─── Global Hook Registry (for future module extensibility) ──────────────────

const globalHooks = new Map<string, PipelineHooks[]>();

/**
 * Register a hook for a specific pipeline.
 * Future modules (7.9, 7.10, 7.11) use this to tap into pipelines.
 * @example
 * // In Module 7.10 (Emotion Detection):
 * registerHook("guided-story-scene", {
 *   onAfterStep: async (stepName, result, ctx) => {
 *     if (stepName === "generate-scene") {
 *       const emotion = await detectEmotion(result.scene.text);
 *       ctx.setMeta("detectedEmotion", emotion);
 *     }
 *   }
 * });
 */
export function registerHook(pipelineName: string, hooks: PipelineHooks): void {
  if (!globalHooks.has(pipelineName)) {
    globalHooks.set(pipelineName, []);
  }
  globalHooks.get(pipelineName)!.push(hooks);
}

// ─── Pipeline Runner ──────────────────────────────────────────────────────────

export async function runPipeline<TFinalResult = unknown>(
  definition: PipelineDefinition,
  input: unknown,
  abortSignal?: AbortSignal
): Promise<PipelineResult<TFinalResult>> {
  const pipelineId = crypto.randomUUID();
  const meta = new Map<string, unknown>();
  const results = new Map<string, unknown>();

  const context: PipelineContext = {
    pipelineId,
    pipelineName: definition.name,
    input,
    results,
    meta,
    setMeta: (key, value) => meta.set(key, value),
    getMeta: (key) => meta.get(key),
  };

  // Collect all hooks: definition-level + globally registered
  const allHooks: PipelineHooks[] = [
    ...(definition.hooks ? [definition.hooks] : []),
    ...(globalHooks.get(definition.name) ?? []),
  ];

  eventBus.emit("pipeline:started", {
    pipelineId,
    pipelineName: definition.name,
    totalSteps: definition.steps.length,
  });

  let currentInput: unknown = input;

  for (let i = 0; i < definition.steps.length; i++) {
    const step = definition.steps[i];

    if (abortSignal?.aborted) {
      eventBus.emit("pipeline:cancelled", {
        pipelineId,
        pipelineName: definition.name,
      });
      return { success: false, results, error: "Pipeline cancelled", failedStep: step.name };
    }

    eventBus.emit("pipeline:step-started", {
      pipelineId,
      stepName: step.name,
      stepIndex: i,
    });

    // Run onBeforeStep hooks
    let skip = false;
    for (const hook of allHooks) {
      if (hook.onBeforeStep) {
        try {
          const result = await hook.onBeforeStep(step.name, context);
          if (result === false) {
            skip = true;
            break;
          }
        } catch (error) {
          console.warn(`[Pipeline] onBeforeStep hook error (${step.name}):`, error);
        }
      }
    }

    if (skip) {
      eventBus.emit("pipeline:step-complete", {
        pipelineId,
        stepName: step.name,
        stepIndex: i,
        totalSteps: definition.steps.length,
      });
      continue;
    }

    try {
      const stepResult = await step.execute(currentInput, context);
      results.set(step.name, stepResult);
      currentInput = stepResult; // Each step's output feeds into the next

      // Run onAfterStep hooks
      for (const hook of allHooks) {
        if (hook.onAfterStep) {
          try {
            await hook.onAfterStep(step.name, stepResult, context);
          } catch (error) {
            console.warn(`[Pipeline] onAfterStep hook error (${step.name}):`, error);
          }
        }
      }

      eventBus.emit("pipeline:step-complete", {
        pipelineId,
        stepName: step.name,
        stepIndex: i,
        totalSteps: definition.steps.length,
      });
    } catch (rawError) {
      const error = rawError instanceof Error ? rawError : new Error(String(rawError));
      const isCritical = step.critical !== false; // Default: critical

      // Run onPipelineError hooks
      for (const hook of allHooks) {
        if (hook.onPipelineError) {
          try {
            await hook.onPipelineError(error, step.name, context);
          } catch (hookError) {
            console.warn(`[Pipeline] onPipelineError hook error:`, hookError);
          }
        }
      }

      if (isCritical) {
        eventBus.emit("pipeline:failed", {
          pipelineId,
          pipelineName: definition.name,
          failedStep: step.name,
          error: error.message,
        });
        return {
          success: false,
          results,
          error: error.message,
          failedStep: step.name,
        };
      }

      // Non-critical: log and continue
      console.warn(`[Pipeline] Non-critical step "${step.name}" failed:`, error.message);
      results.set(step.name, null);

      eventBus.emit("pipeline:step-complete", {
        pipelineId,
        stepName: step.name,
        stepIndex: i,
        totalSteps: definition.steps.length,
      });
    }
  }

  // Run onPipelineComplete hooks
  for (const hook of allHooks) {
    if (hook.onPipelineComplete) {
      try {
        await hook.onPipelineComplete(context);
      } catch (error) {
        console.warn(`[Pipeline] onPipelineComplete hook error:`, error);
      }
    }
  }

  eventBus.emit("pipeline:completed", {
    pipelineId,
    pipelineName: definition.name,
  });

  // Final result is the output of the last step
  const lastStep = definition.steps[definition.steps.length - 1];
  const finalResult = results.get(lastStep.name) as TFinalResult | undefined;

  return { success: true, results, finalResult };
}
