/**
 * Module 7.8 – Asynchronous Processing & System Orchestration
 * React Hook: usePipeline
 * Connects the UI to pipeline execution and progress tracking.
 */

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { runPipeline, eventBus, type PipelineDefinition, type PipelineResult, type OrchestratorEventPayload } from "@/lib/orchestration";

export type PipelineStatus = "idle" | "running" | "completed" | "failed" | "cancelled";

export function usePipeline<TResult = unknown>(definition: PipelineDefinition) {
  const [status, setStatus] = useState<PipelineStatus>("idle");
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [stepProgress, setStepProgress] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, unknown>>(new Map());
  const [finalResult, setFinalResult] = useState<TResult | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const activePipelineIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handleStarted = (payload: OrchestratorEventPayload<"pipeline:started">) => {
      if (payload.pipelineName !== definition.name) return;
      activePipelineIdRef.current = payload.pipelineId;
      setStatus("running");
      setCurrentStep(null);
      setStepProgress(0);
      setOverallProgress(0);
      setError(null);
      setResults(new Map());
      setFinalResult(null);
    };

    const handleStepStarted = (payload: OrchestratorEventPayload<"pipeline:step-started">) => {
      if (payload.pipelineId !== activePipelineIdRef.current) return;
      setCurrentStep(payload.stepName);
      setStepProgress(0);
    };

    const handleStepComplete = (payload: OrchestratorEventPayload<"pipeline:step-complete">) => {
      if (payload.pipelineId !== activePipelineIdRef.current) return;
      setStepProgress(100);
      setOverallProgress(((payload.stepIndex + 1) / payload.totalSteps) * 100);
    };

    const handleCompleted = (payload: OrchestratorEventPayload<"pipeline:completed">) => {
      if (payload.pipelineId !== activePipelineIdRef.current) return;
      setStatus("completed");
      setStepProgress(100);
      setOverallProgress(100);
      activePipelineIdRef.current = null;
    };

    const handleFailed = (payload: OrchestratorEventPayload<"pipeline:failed">) => {
      if (payload.pipelineId !== activePipelineIdRef.current) return;
      setStatus("failed");
      setError(payload.error);
      activePipelineIdRef.current = null;
    };

    const handleCancelled = (payload: OrchestratorEventPayload<"pipeline:cancelled">) => {
      if (payload.pipelineId !== activePipelineIdRef.current) return;
      setStatus("cancelled");
      activePipelineIdRef.current = null;
    };

    // We can also listen to task events to get granular step progress
    // assuming the step name matches the task type or we can infer it
    const handleTaskProgress = (payload: OrchestratorEventPayload<"task:progress">) => {
      // If we're running and a task reports progress, surface it
      if (status === "running") {
         setStepProgress(payload.progress);
      }
    };

    const unsubStarted = eventBus.on("pipeline:started", handleStarted);
    const unsubStepStarted = eventBus.on("pipeline:step-started", handleStepStarted);
    const unsubStepComplete = eventBus.on("pipeline:step-complete", handleStepComplete);
    const unsubCompleted = eventBus.on("pipeline:completed", handleCompleted);
    const unsubFailed = eventBus.on("pipeline:failed", handleFailed);
    const unsubCancelled = eventBus.on("pipeline:cancelled", handleCancelled);
    const unsubTaskProgress = eventBus.on("task:progress", handleTaskProgress);

    return () => {
      unsubStarted();
      unsubStepStarted();
      unsubStepComplete();
      unsubCompleted();
      unsubFailed();
      unsubCancelled();
      unsubTaskProgress();
    };
  }, [definition.name, status]);

  const run = useCallback(async (input: unknown): Promise<PipelineResult<TResult>> => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const result = await runPipeline<TResult>(definition, input, abortControllerRef.current.signal);
    
    setResults(result.results);
    if (result.success && result.finalResult !== undefined) {
       setFinalResult(result.finalResult);
    }
    
    return result;
  }, [definition]);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setCurrentStep(null);
    setStepProgress(0);
    setOverallProgress(0);
    setError(null);
    setResults(new Map());
    setFinalResult(null);
    activePipelineIdRef.current = null;
  }, []);

  return {
    run,
    cancel,
    reset,
    status,
    currentStep,
    stepProgress,
    overallProgress,
    error,
    results,
    finalResult,
  };
}
