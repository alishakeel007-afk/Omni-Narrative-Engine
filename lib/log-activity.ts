"use client";

/**
 * Client-side helper that logs a user activity to the database.
 * Silently fails — never interrupts the user experience.
 */
export async function logActivity(
  activityType: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityType, metadata }),
    });
  } catch {
    // intentionally silent
  }
}
