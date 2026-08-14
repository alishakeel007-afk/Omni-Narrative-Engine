/**
 * Module 7.8 – Asynchronous Processing & System Orchestration
 * Task Queue: Core async task manager with concurrency, retry, and cancellation.
 */

import { eventBus } from "./event-bus";
import { type RetryStrategy, AI_GENERATION_RETRY, computeDelay } from "./retry-strategy";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "RETRYING"
  | "CANCELLED";

export type Task<TPayload = unknown, TResult = unknown> = {
  id: string;
  type: string;
  status: TaskStatus;
  payload: TPayload;
  result?: TResult;
  error?: string;
  progress: number; // 0–100
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  meta?: Record<string, unknown>; // Extensible for future modules (7.10, 7.11, etc.)
};

export type TaskExecutor<TPayload = unknown, TResult = unknown> = (
  payload: TPayload,
  helpers: TaskHelpers
) => Promise<TResult>;

export type TaskHelpers = {
  reportProgress: (progress: number, message?: string) => void;
  signal: AbortSignal;
};

export type TaskQueueConfig = {
  maxConcurrency: number;
  defaultRetryStrategy: RetryStrategy;
};

const DEFAULT_CONFIG: TaskQueueConfig = {
  maxConcurrency: 2,
  defaultRetryStrategy: AI_GENERATION_RETRY,
};

// ─── Task Queue ───────────────────────────────────────────────────────────────

class TaskQueue {
  private readonly tasks = new Map<string, Task>();
  private readonly executors = new Map<string, TaskExecutor>();
  private readonly retryStrategies = new Map<string, RetryStrategy>();
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly config: TaskQueueConfig;
  private running = 0;
  private readonly queue: string[] = []; // Ordered list of pending task IDs

  constructor(config: Partial<TaskQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Register a task type executor */
  register<TPayload = unknown, TResult = unknown>(
    type: string,
    executor: TaskExecutor<TPayload, TResult>,
    retryStrategy?: RetryStrategy
  ): void {
    this.executors.set(type, executor as TaskExecutor);
    if (retryStrategy) {
      this.retryStrategies.set(type, retryStrategy);
    }
  }

  /** Dispatch a new task and return its ID */
  dispatch<TPayload = unknown>(
    type: string,
    payload: TPayload,
    meta?: Record<string, unknown>
  ): string {
    if (!this.executors.has(type)) {
      throw new Error(`[TaskQueue] No executor registered for task type "${type}"`);
    }

    const strategy = this.retryStrategies.get(type) ?? this.config.defaultRetryStrategy;
    const task: Task<TPayload> = {
      id: crypto.randomUUID(),
      type,
      status: "PENDING",
      payload,
      progress: 0,
      retryCount: 0,
      maxRetries: strategy.maxRetries,
      createdAt: new Date().toISOString(),
      meta,
    };

    this.tasks.set(task.id, task as Task);
    this.queue.push(task.id);

    eventBus.emit("task:queued", { taskId: task.id, taskType: type });

    this.drain();
    return task.id;
  }

  /** Cancel a running or pending task */
  cancel(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status === "COMPLETED" || task.status === "FAILED") return;

    this.abortControllers.get(taskId)?.abort();
    this.updateTask(taskId, { status: "CANCELLED" });

    const queueIndex = this.queue.indexOf(taskId);
    if (queueIndex !== -1) this.queue.splice(queueIndex, 1);

    eventBus.emit("task:cancelled", { taskId, taskType: task.type });
  }

  /** Get a snapshot of all tasks */
  getTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /** Get a specific task */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /** Remove completed and failed tasks */
  clearFinished(): void {
    for (const [id, task] of this.tasks) {
      if (task.status === "COMPLETED" || task.status === "FAILED" || task.status === "CANCELLED") {
        this.tasks.delete(id);
      }
    }
  }

  // ─── Private Methods ──────────────────────────────────────────────────────

  private drain(): void {
    while (this.running < this.config.maxConcurrency && this.queue.length > 0) {
      const taskId = this.queue.shift()!;
      const task = this.tasks.get(taskId);
      if (task && task.status === "PENDING") {
        void this.execute(taskId, 0);
      }
    }
  }

  private async execute(taskId: string, attempt: number): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const strategy = this.retryStrategies.get(task.type) ?? this.config.defaultRetryStrategy;
    const executor = this.executors.get(task.type)!;
    const abortController = new AbortController();
    this.abortControllers.set(taskId, abortController);

    this.running++;
    this.updateTask(taskId, {
      status: "RUNNING",
      startedAt: new Date().toISOString(),
      retryCount: attempt,
    });

    eventBus.emit("task:started", { taskId, taskType: task.type });

    const helpers: TaskHelpers = {
      reportProgress: (progress, message) => {
        this.updateTask(taskId, { progress });
        eventBus.emit("task:progress", { taskId, progress, message });
      },
      signal: abortController.signal,
    };

    try {
      const result = await executor(task.payload, helpers);

      if (abortController.signal.aborted) {
        // Task was cancelled mid-flight — already handled by cancel()
        this.running--;
        this.drain();
        return;
      }

      this.updateTask(taskId, {
        status: "COMPLETED",
        result,
        progress: 100,
        completedAt: new Date().toISOString(),
      });
      this.abortControllers.delete(taskId);

      eventBus.emit("task:completed", { taskId, taskType: task.type, result });
    } catch (rawError) {
      const error = rawError instanceof Error ? rawError : new Error(String(rawError));

      if (abortController.signal.aborted) {
        this.running--;
        this.drain();
        return;
      }

      const willRetry = attempt < strategy.maxRetries && strategy.shouldRetry(error, attempt);

      if (willRetry) {
        const delay = computeDelay(strategy, attempt);
        this.updateTask(taskId, { status: "RETRYING", error: error.message });
        eventBus.emit("task:retrying", {
          taskId,
          taskType: task.type,
          attempt: attempt + 1,
          maxRetries: strategy.maxRetries,
        });
        eventBus.emit("task:failed", {
          taskId,
          taskType: task.type,
          error: error.message,
          willRetry: true,
        });

        this.running--;
        await new Promise((resolve) => setTimeout(resolve, delay));
        void this.execute(taskId, attempt + 1);
      } else {
        this.updateTask(taskId, {
          status: "FAILED",
          error: error.message,
          completedAt: new Date().toISOString(),
        });
        this.abortControllers.delete(taskId);
        eventBus.emit("task:failed", {
          taskId,
          taskType: task.type,
          error: error.message,
          willRetry: false,
        });
        this.running--;
        this.drain();
      }
    }

    if (this.tasks.get(taskId)?.status === "COMPLETED" || this.tasks.get(taskId)?.status === "FAILED") {
      this.drain();
    }
  }

  private updateTask(taskId: string, updates: Partial<Task>): void {
    const existing = this.tasks.get(taskId);
    if (!existing) return;
    this.tasks.set(taskId, { ...existing, ...updates });
  }
}

// Singleton instance
export const taskQueue = new TaskQueue();
