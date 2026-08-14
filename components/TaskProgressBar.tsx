"use client";

import { useTaskQueue } from "@/hooks/useTaskQueue";
import { type PipelineStatus } from "@/hooks/usePipeline";
import { Loader2, AlertCircle, CheckCircle2, XCircle, RotateCcw } from "lucide-react";

type TaskProgressBarProps = {
  status: PipelineStatus;
  currentStep: string | null;
  overallProgress: number;
  error: string | null;
  onCancel?: () => void;
  className?: string;
  // Optional: mapping of raw step names to user-friendly labels
  stepLabels?: Record<string, string>;
};

export function TaskProgressBar({
  status,
  currentStep,
  overallProgress,
  error,
  onCancel,
  className = "",
  stepLabels = {},
}: TaskProgressBarProps) {
  const { activeTasks } = useTaskQueue();

  if (status === "idle") return null;

  // Find if there's an active task that corresponds to the current step
  // and see if it's retrying to show a warning state
  const retryingTask = activeTasks.find((t) => t.status === "RETRYING");
  const isRetrying = !!retryingTask;

  const displayStep = currentStep
    ? stepLabels[currentStep] ||
      currentStep
        .replace(/-/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase()) // title case
    : "Initializing...";

  let statusIcon = <Loader2 className="w-5 h-5 animate-spin text-blue-500" />;
  let statusColor = "text-blue-400";
  let barColor = "bg-blue-500";

  if (status === "completed") {
    statusIcon = <CheckCircle2 className="w-5 h-5 text-green-500" />;
    statusColor = "text-green-400";
    barColor = "bg-green-500";
  } else if (status === "failed") {
    statusIcon = <XCircle className="w-5 h-5 text-red-500" />;
    statusColor = "text-red-400";
    barColor = "bg-red-500";
  } else if (isRetrying) {
    statusIcon = <AlertCircle className="w-5 h-5 text-amber-500" />;
    statusColor = "text-amber-400";
    barColor = "bg-amber-500";
  }

  return (
    <div className={`bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-4 shadow-xl ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {statusIcon}
          <div>
            <h4 className="text-sm font-medium text-white">
              {status === "completed"
                ? "Generation Complete"
                : status === "failed"
                ? "Generation Failed"
                : displayStep}
            </h4>
            {isRetrying && retryingTask && (
              <p className="text-xs text-amber-400/80 mt-0.5">
                Retrying... ({retryingTask.retryCount}/{retryingTask.maxRetries})
              </p>
            )}
            {error && <p className="text-xs text-red-400/80 mt-0.5">{error}</p>}
          </div>
        </div>

        {status === "running" && onCancel && (
          <button
            onClick={onCancel}
            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
            title="Cancel Generation"
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Overall Progress</span>
          <span>{Math.round(overallProgress)}%</span>
        </div>
        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-500 ease-out`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
