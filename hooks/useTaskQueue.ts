/**
 * Module 7.8 – Asynchronous Processing & System Orchestration
 * React Hook: useTaskQueue
 * Connects the UI to the global task queue singleton for real-time progress.
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { taskQueue, eventBus, type Task, type OrchestratorEventPayload } from "@/lib/orchestration";

export function useTaskQueue() {
  const [tasks, setTasks] = useState<Task[]>([]);

  // Initialize and subscribe to events
  useEffect(() => {
    // Initial state
    setTasks(taskQueue.getTasks());

    const updateTasks = () => setTasks(taskQueue.getTasks());

    const handleProgress = (payload: OrchestratorEventPayload<"task:progress">) => {
      setTasks((current) =>
        current.map((t) =>
          t.id === payload.taskId
            ? { ...t, progress: payload.progress, meta: { ...t.meta, message: payload.message } }
            : t
        )
      );
    };

    const handleRetrying = (payload: OrchestratorEventPayload<"task:retrying">) => {
      setTasks((current) =>
        current.map((t) =>
          t.id === payload.taskId
            ? { ...t, status: "RETRYING", retryCount: payload.attempt, maxRetries: payload.maxRetries }
            : t
        )
      );
    };

    // Subscriptions
    const unsubQueued = eventBus.on("task:queued", updateTasks);
    const unsubStarted = eventBus.on("task:started", updateTasks);
    const unsubProgress = eventBus.on("task:progress", handleProgress);
    const unsubCompleted = eventBus.on("task:completed", updateTasks);
    const unsubFailed = eventBus.on("task:failed", updateTasks);
    const unsubCancelled = eventBus.on("task:cancelled", updateTasks);
    const unsubRetrying = eventBus.on("task:retrying", handleRetrying);

    return () => {
      unsubQueued();
      unsubStarted();
      unsubProgress();
      unsubCompleted();
      unsubFailed();
      unsubCancelled();
      unsubRetrying();
    };
  }, []);

  const dispatch = useCallback((type: string, payload: unknown, meta?: Record<string, unknown>) => {
    return taskQueue.dispatch(type, payload, meta);
  }, []);

  const cancel = useCallback((taskId: string) => {
    taskQueue.cancel(taskId);
    setTasks(taskQueue.getTasks());
  }, []);

  const clearFinished = useCallback(() => {
    taskQueue.clearFinished();
    setTasks(taskQueue.getTasks());
  }, []);

  const getTask = useCallback(
    (taskId: string) => tasks.find((t) => t.id === taskId),
    [tasks]
  );

  return {
    tasks,
    activeTasks: tasks.filter((t) => t.status === "RUNNING" || t.status === "RETRYING"),
    dispatch,
    cancel,
    clearFinished,
    getTask,
  };
}
