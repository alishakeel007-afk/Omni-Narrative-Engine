// Session storage utilities for auto-save and recovery

import type { PersistedStoryState } from "@/lib/story-storage";

export interface RecoveryPoint {
  timestamp: string;
  sceneIndex: number;
  healthStatus: any;
  selectedChoice: string;
  stateHash: string;
}

/**
 * Generate hash of state for integrity checking
 */
export function generateStateHash(state: any): string {
  const json = JSON.stringify(state);
  let hash = 0;

  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return Math.abs(hash).toString(16);
}

/**
 * Save recovery point to session storage
 */
export function saveRecoveryPoint(state: PersistedStoryState): void {
  const recoveryPoint: RecoveryPoint = {
    timestamp: new Date().toISOString(),
    sceneIndex: state.currentSceneIndex,
    healthStatus: state.healthStatus,
    selectedChoice: state.selectedChoice,
    stateHash: generateStateHash(state)
  };

  // Keep last 5 recovery points
  const existing = getRecoveryHistory();
  const updated = [recoveryPoint, ...existing].slice(0, 5);

  try {
    sessionStorage.setItem("recovery_history", JSON.stringify(updated));
  } catch (error) {
    console.warn("Failed to save recovery point:", error);
  }
}

/**
 * Get recovery history
 */
export function getRecoveryHistory(): RecoveryPoint[] {
  try {
    const data = sessionStorage.getItem("recovery_history");
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Get latest recovery point
 */
export function getLatestRecoveryPoint(): RecoveryPoint | null {
  const history = getRecoveryHistory();
  return history[0] ?? null;
}

/**
 * Clear recovery history
 */
export function clearRecoveryHistory(): void {
  sessionStorage.removeItem("recovery_history");
}

/**
 * Check if recovery is needed
 */
export function shouldAttemptRecovery(): boolean {
  const latestRecovery = getLatestRecoveryPoint();
  if (!latestRecovery) return false;

  const recoveryTime = new Date(latestRecovery.timestamp);
  const now = new Date();
  const minutesSinceRecovery = (now.getTime() - recoveryTime.getTime()) / 60000;

  // Only attempt recovery if less than 30 minutes have passed
  return minutesSinceRecovery < 30;
}

/**
 * Create auto-save timer
 */
export function createAutoSaveTimer(
  callback: () => void,
  intervalMs: number = 30000 // 30 seconds
): () => void {
  const interval = setInterval(callback, intervalMs);
  return () => clearInterval(interval);
}

/**
 * Check for browser storage quota
 */
export function getStorageStatus(): {
  available: boolean;
  usedBytes: number;
  estimatedQuotaBytes: number;
  percentageUsed: number;
} {
  if (!navigator.storage) {
    return {
      available: false,
      usedBytes: 0,
      estimatedQuotaBytes: 0,
      percentageUsed: 0
    };
  }

  const localStorageSize = Object.keys(localStorage).reduce((total, key) => {
    return total + localStorage.getItem(key)!.length;
  }, 0);

  // Typical quota is 5-10MB
  const estimatedQuota = 5 * 1024 * 1024; // 5MB

  return {
    available: true,
    usedBytes: localStorageSize,
    estimatedQuotaBytes: estimatedQuota,
    percentageUsed: (localStorageSize / estimatedQuota) * 100
  };
}

/**
 * Request persistent storage if available
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) {
    return false;
  }

  try {
    return await navigator.storage.persist();
  } catch (error) {
    console.warn("Failed to request persistent storage:", error);
    return false;
  }
}

/**
 * Check if data is persisted
 */
export async function isDataPersisted(): Promise<boolean> {
  if (!navigator.storage?.persisted) {
    return false;
  }

  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

/**
 * Clean old entries from localStorage
 */
export function cleanupOldStorage(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void {
  const keysToCheck = [
    "story_setup",
    "story_progress",
    "recovery_history"
  ];

  keysToCheck.forEach(key => {
    try {
      const data = localStorage.getItem(key);
      if (!data) return;

      const parsed = JSON.parse(data);
      const lastUpdated = new Date(parsed.lastUpdatedAt || parsed.lastSavedAt);
      const age = Date.now() - lastUpdated.getTime();

      if (age > maxAgeMs) {
        localStorage.removeItem(key);
        console.log(`Cleaned up old storage: ${key}`);
      }
    } catch {
      // Silently fail
    }
  });
}

/**
 * Export state for backup
 */
export function exportStateAsJson(state: any): string {
  return JSON.stringify(state, null, 2);
}

/**
 * Download state as file
 */
export function downloadStateAsFile(state: any, filename: string = "story-state.json"): void {
  const json = exportStateAsJson(state);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

/**
 * Import state from file
 */
export async function importStateFromFile(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        resolve(data);
      } catch (error) {
        reject(new Error("Invalid JSON file"));
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsText(file);
  });
}
