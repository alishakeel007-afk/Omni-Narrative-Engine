// Toast notification system for user feedback

"use client";

import { useCallback, useState } from "react";
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const TOAST_ICONS: Record<ToastType, any> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle
};

const TOAST_COLORS: Record<ToastType, string> = {
  success: "bg-green-500/10 border-green-500/20 text-green-400",
  error: "bg-red-500/10 border-red-500/20 text-red-400",
  info: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  warning: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
};

/**
 * Toast context for global toast management
 */
let toastCallbacks: Array<(toast: Toast) => void> = [];

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Partial<Toast>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = {
      id,
      type: "info",
      duration: 3000,
      ...toast,
      message: toast.message || "Notification"
    };

    setToasts((prev) => [...prev, newToast]);

    if (newToast.duration) {
      setTimeout(() => removeToast(id), newToast.duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

/**
 * Toast notification component
 */
export function Toast({
  toast,
  onDismiss
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const Icon = TOAST_ICONS[toast.type];
  const colorClass = TOAST_COLORS[toast.type];

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-4 mb-2 ${colorClass} animate-slide-in`}
      role="alert"
    >
      <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />

      <div className="flex-grow">
        <p className="text-sm font-medium">{toast.message}</p>
        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className="mt-2 text-xs font-semibold underline hover:opacity-80"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        onClick={onDismiss}
        className="flex-shrink-0 hover:opacity-70"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Toast container component
 */
export function ToastContainer({ toasts, onDismiss }: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm space-y-2">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          toast={toast}
          onDismiss={() => onDismiss(toast.id)}
        />
      ))}
    </div>
  );
}

/**
 * Stat change toast
 */
export function createStatChangeToast(
  statName: string,
  change: number
): Partial<Toast> {
  const isPositive = change > 0;
  const absChange = Math.abs(change);
  const direction = isPositive ? "increased" : "decreased";

  return {
    type: isPositive ? "success" : "warning",
    message: `${statName} ${direction} by ${absChange}`,
    duration: 2000
  };
}

/**
 * Choice impact toast
 */
export function createChoiceImpactToast(impacts: string[]): Partial<Toast> {
  const message = impacts.length > 1
    ? `Multiple effects: ${impacts.join(", ")}`
    : impacts[0];

  return {
    type: "info",
    message,
    duration: 3000
  };
}

/**
 * Error toast
 */
export function createErrorToast(message: string): Partial<Toast> {
  return {
    type: "error",
    message,
    duration: 4000
  };
}

/**
 * Success toast
 */
export function createSuccessToast(message: string): Partial<Toast> {
  return {
    type: "success",
    message,
    duration: 2000
  };
}

/**
 * Warning toast
 */
export function createWarningToast(message: string): Partial<Toast> {
  return {
    type: "warning",
    message,
    duration: 3000
  };
}

/**
 * Game over toast
 */
export function createGameOverToast(reason: string): Partial<Toast> {
  const messages: Record<string, string> = {
    DEATH: "You have fallen in battle...",
    DESPAIR: "Your will has been broken...",
    EXHAUSTION: "You have exhausted your strength...",
    MADNESS: "Your mind could not withstand it...",
    TIME_LIMIT: "Time has run out...",
    PLAYER_QUIT: "You have chosen to leave..."
  };

  return {
    type: "error",
    message: messages[reason] || "Game Over",
    duration: 5000
  };
}

/**
 * Scene generated toast
 */
export function createSceneGeneratedToast(): Partial<Toast> {
  return {
    type: "success",
    message: "New scene generated",
    duration: 1500
  };
}
