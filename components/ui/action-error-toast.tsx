"use client";

import { AlertCircle, X } from "lucide-react";

/** Keep errors visible even when their action is far below the page header. */
export function ActionErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  if (!message) return null;
  return <div role="alert" className="action-error-toast">
    <AlertCircle size={18} aria-hidden />
    <p>{message}</p>
    <button type="button" aria-label="Dismiss error" onClick={onDismiss}><X size={18} aria-hidden /></button>
  </div>;
}
