"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  getLocalQueue,
  saveLocalQueue,
  enqueueLocalSave,
  type SavePayload,
  type QueuedSave,
} from "@/lib/save-queue";
import type { PersistedMemoryFact } from "@/types/story";

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 60_000;

function backoffMs(attempts: number) {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempts - 1), MAX_BACKOFF_MS);
}

export function useSaveQueue() {
  const busyRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successCallbacksRef = useRef(new Map<string, (memories: PersistedMemoryFact[]) => void>());

  const attemptSave = useCallback(async (item: QueuedSave): Promise<{ success: boolean; memories: PersistedMemoryFact[] }> => {
    const { projectId, draftId, sceneNumber, scene, choice, choiceSceneNumber, currentState, setup } = item.payload;
    try {
      const response = await fetch(`/api/story/${projectId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, sceneNumber, scene, choice, choiceSceneNumber, currentState, setup }),
      });
      if (!response.ok) return { success: false, memories: [] };
      const data = await response.json().catch(() => null) as { memories?: unknown } | null;
      const memories = Array.isArray(data?.memories)
        ? data.memories.filter((memory): memory is PersistedMemoryFact => Boolean(
          memory && typeof memory === "object" && typeof (memory as PersistedMemoryFact).id === "string" &&
          typeof (memory as PersistedMemoryFact).memoryType === "string" && typeof (memory as PersistedMemoryFact).content === "string" &&
          typeof (memory as PersistedMemoryFact).importanceScore === "number"
        ))
        : [];
      return { success: true, memories };
    } catch {
      return { success: false, memories: [] };
    }
  }, []);

  const drainQueue = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    while (true) {
      const queue = getLocalQueue();
      // Only process pending items (if an item failed 5 times, we leave it in the queue with status="pending" and attempts=0)
      // Actually, we want to retry everything that is pending.
      // We process the first item in the queue.
      if (queue.length === 0) break;
      
      const item = queue[0];
      item.attempts += 1;
      item.updatedAt = new Date().toISOString();
      
      // Save attempt increment to local storage
      saveLocalQueue(queue);

      const result = await attemptSave(item);

      if (result.success) {
        // Success: remove from local storage
        const currentQueue = getLocalQueue();
        saveLocalQueue(currentQueue.filter((q) => q.id !== item.id));
        const onSaved = successCallbacksRef.current.get(item.id);
        successCallbacksRef.current.delete(item.id);
        onSaved?.(result.memories);
      } else {
        const currentQueue = getLocalQueue();
        const updatedItem = currentQueue.find((q) => q.id === item.id);
        
        if (updatedItem) {
          if (updatedItem.attempts >= MAX_ATTEMPTS) {
            console.error(`[SaveQueue] Save failed ${MAX_ATTEMPTS} times. Persisting permanently in localStorage until next session.`, { sceneNumber: item.payload.sceneNumber });
            // Reset attempts and leave as pending, but stop draining to prevent infinite loops in this session
            updatedItem.attempts = 0;
            saveLocalQueue(currentQueue);
            break;
          } else {
            const delay = backoffMs(updatedItem.attempts);
            console.warn(`[SaveQueue] Save failed (attempt ${updatedItem.attempts}), retrying in ${delay}ms`);
            retryTimerRef.current = setTimeout(() => {
              drainQueue();
            }, delay);
            break;
          }
        } else {
          // Item was removed by another tab or sync process? Just continue.
          break;
        }
      }
    }

    busyRef.current = false;
  }, [attemptSave]);

  const enqueue = useCallback(
    (payload: SavePayload, onSaved?: (memories: PersistedMemoryFact[]) => void) => {
      const item = enqueueLocalSave(payload);
      if (onSaved) successCallbacksRef.current.set(item.id, onSaved);
      drainQueue();
    },
    [drainQueue]
  );

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") drainQueue();
    };
    const onOnline = () => {
      console.log("[SaveQueue] Browser online, retrying pending saves...");
      drainQueue();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    // Initial drain on mount (picks up cross-session pending saves)
    drainQueue();

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [drainQueue]);

  const getPendingCount = useCallback(() => getLocalQueue().length, []);

  return { enqueue, getPendingCount };
}
