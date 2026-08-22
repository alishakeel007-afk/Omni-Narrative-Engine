import type { StoryScene, HealthStatus, ChoiceType } from "@/types/story";

export interface SavePayload {
  projectId: string;
  draftId: string;
  sceneNumber: number;
  scene: StoryScene;
  choice: {
    text: string;
    choiceType: ChoiceType;
  };
  currentState: {
    sceneNumber: number;
    healthStatus: HealthStatus;
    inventory: string[];
  };
}

export interface QueuedSave {
  id: string;
  projectId: string;
  draftId: string;
  payload: SavePayload;
  status: "pending" | "processing";
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "omni_pending_saves";

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getLocalQueue(): QueuedSave[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveLocalQueue(queue: QueuedSave[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function enqueueLocalSave(payload: SavePayload): QueuedSave {
  const queue = getLocalQueue();
  const newItem: QueuedSave = {
    id: genId(),
    projectId: payload.projectId,
    draftId: payload.draftId,
    payload,
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  queue.push(newItem);
  saveLocalQueue(queue);
  return newItem;
}

async function attemptSave(item: QueuedSave): Promise<boolean> {
  const { projectId, draftId, sceneNumber, scene, choice, currentState } = item.payload;
  try {
    const response = await fetch(`/api/story/${projectId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId, sceneNumber, scene, choice, currentState }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Attempts to synchronously push all pending saves for a specific draft.
 * Called before loading the draft from the DB to prevent data loss.
 * Preserves FIFO ordering.
 * Returns true if the queue for this draft is now empty (success).
 */
export async function syncPendingSavesForDraft(draftId: string): Promise<boolean> {
  const queue = getLocalQueue();
  const draftSaves = queue.filter(item => item.draftId === draftId);
  
  if (draftSaves.length === 0) return true;
  
  for (const item of draftSaves) {
    const success = await attemptSave(item);
    if (success) {
      // Remove from queue
      const currentQueue = getLocalQueue();
      saveLocalQueue(currentQueue.filter(q => q.id !== item.id));
    } else {
      // If one fails, we stop processing for this draft to preserve FIFO order.
      // We don't increment attempts here, this is a forced sync attempt.
      return false;
    }
  }
  
  return true;
}
