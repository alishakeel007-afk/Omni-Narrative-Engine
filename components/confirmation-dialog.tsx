"use client";

import { AlertTriangle, Trash2, LogOut, RotateCcw } from "lucide-react";

type ConfirmationType = "delete" | "exit" | "reset" | "generic";

interface ConfirmationDialogProps {
  open: boolean;
  type?: ConfirmationType;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

const CONFIRMATION_CONFIG: Record<ConfirmationType, {
  icon: React.ReactNode;
  confirmLabel: string;
  dangerLevel: boolean;
}> = {
  delete: {
    icon: <Trash2 className="h-6 w-6 text-red-400" />,
    confirmLabel: "Delete",
    dangerLevel: true
  },
  exit: {
    icon: <LogOut className="h-6 w-6 text-yellow-400" />,
    confirmLabel: "Exit Without Saving",
    dangerLevel: true
  },
  reset: {
    icon: <RotateCcw className="h-6 w-6 text-orange-400" />,
    confirmLabel: "Reset",
    dangerLevel: true
  },
  generic: {
    icon: <AlertTriangle className="h-6 w-6 text-yellow-400" />,
    confirmLabel: "Confirm",
    dangerLevel: false
  }
};

/**
 * Reusable confirmation dialog component
 */
export function ConfirmationDialog({
  open,
  type = "generic",
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  isDestructive,
  isLoading,
  onConfirm,
  onCancel
}: ConfirmationDialogProps) {
  const config = CONFIRMATION_CONFIG[type];
  const isDangerous = isDestructive ?? config.dangerLevel;

  if (!open) return null;

  const handleConfirm = async () => {
    try {
      await onConfirm();
    } catch (error) {
      console.error("Confirmation error:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="rounded-2xl bg-slate-900 p-6 shadow-2xl max-w-sm">
        {/* Icon */}
        <div className="mb-4 flex justify-center">
          {config.icon}
        </div>

        {/* Content */}
        <h2 className="text-center text-xl font-semibold text-white">{title}</h2>
        <p className="mt-3 text-center text-white/70">{message}</p>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2 font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`flex-1 rounded-lg px-4 py-2 font-semibold transition ${
              isDangerous
                ? "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                : "bg-gradient-to-r from-aurora via-starlight to-gold text-slate-950 hover:shadow-lg disabled:opacity-50"
            }`}
          >
            {isLoading ? "Processing..." : confirmLabel || config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook for managing confirmation dialog state
 */
export function useConfirmation() {
  const [open, setOpen] = React.useState(false);
  const [config, setConfig] = React.useState<Omit<ConfirmationDialogProps, 'open'> | null>(null);

  const confirm = (dialogConfig: Omit<ConfirmationDialogProps, 'open' | 'onCancel'>) => {
    return new Promise<boolean>((resolve) => {
      setConfig({
        ...dialogConfig,
        onCancel: () => {
          setOpen(false);
          resolve(false);
        },
        onConfirm: async () => {
          try {
            await dialogConfig.onConfirm();
            setOpen(false);
            resolve(true);
          } catch (error) {
            console.error("Confirmation error:", error);
            resolve(false);
          }
        }
      });
      setOpen(true);
    });
  };

  return {
    open,
    confirm,
    dialog: config
  };
}

import React from "react";
