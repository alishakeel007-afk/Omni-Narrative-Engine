/**
 * Module 7.8 – Asynchronous Processing & System Orchestration
 * Event Bus: Typed, singleton event emitter for decoupled communication
 * between the task queue, pipelines, and UI components.
 */

type OrchestratorEventMap = {
  "task:queued": { taskId: string; taskType: string };
  "task:started": { taskId: string; taskType: string };
  "task:progress": { taskId: string; progress: number; message?: string };
  "task:completed": { taskId: string; taskType: string; result: unknown };
  "task:failed": { taskId: string; taskType: string; error: string; willRetry: boolean };
  "task:cancelled": { taskId: string; taskType: string };
  "task:retrying": { taskId: string; taskType: string; attempt: number; maxRetries: number };
  "pipeline:started": { pipelineId: string; pipelineName: string; totalSteps: number };
  "pipeline:step-started": { pipelineId: string; stepName: string; stepIndex: number };
  "pipeline:step-complete": { pipelineId: string; stepName: string; stepIndex: number; totalSteps: number };
  "pipeline:completed": { pipelineId: string; pipelineName: string };
  "pipeline:failed": { pipelineId: string; pipelineName: string; failedStep: string; error: string };
  "pipeline:cancelled": { pipelineId: string; pipelineName: string };
};

export type OrchestratorEventType = keyof OrchestratorEventMap;
export type OrchestratorEventPayload<T extends OrchestratorEventType> = OrchestratorEventMap[T];

type Listener<T extends OrchestratorEventType> = (payload: OrchestratorEventPayload<T>) => void;

class EventBus {
  private readonly listeners = new Map<string, Set<Listener<OrchestratorEventType>>>();

  on<T extends OrchestratorEventType>(event: T, listener: Listener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener<OrchestratorEventType>);

    // Return an unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(listener as Listener<OrchestratorEventType>);
    };
  }

  emit<T extends OrchestratorEventType>(event: T, payload: OrchestratorEventPayload<T>): void {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        (listener as Listener<T>)(payload);
      } catch (error) {
        console.error(`[EventBus] Error in listener for "${event}":`, error);
      }
    });
  }

  off<T extends OrchestratorEventType>(event: T, listener: Listener<T>): void {
    this.listeners.get(event)?.delete(listener as Listener<OrchestratorEventType>);
  }

  once<T extends OrchestratorEventType>(event: T, listener: Listener<T>): void {
    const wrapper = (payload: OrchestratorEventPayload<T>) => {
      listener(payload);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  clear(): void {
    this.listeners.clear();
  }
}

// Singleton instance shared across the app
export const eventBus = new EventBus();
