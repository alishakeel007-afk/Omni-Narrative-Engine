"use client";
import type { StudioTake } from "@/types/studio";

export function ContinuityCheck({
  take,
  busy,
  problem,
  onReview,
}: {
  take: StudioTake;
  busy: boolean;
  problem?: string;
  onReview: () => void;
}) {
  if (take.status !== "complete") return null;
  if (!take.identity?.length)
    return problem ? (
      <p className="studio-continuity" data-status="review">
        {problem}
      </p>
    ) : null;
  const status = take.continuity?.status || "pending";
  const label =
    status === "passed"
      ? "Appearance check passed"
      : status === "failed"
        ? "Appearance drift detected"
        : status === "review"
          ? "Appearance could not be confirmed"
          : status === "error"
            ? "Appearance check unavailable"
            : "Checking character appearance…";
  return (
    <div
      className="studio-continuity"
      data-status={problem && status === "passed" ? "review" : status}
    >
      <p>{problem && status === "passed" ? problem : label}</p>
      {take.continuity?.error && <p>{take.continuity.error}</p>}
      <details>
        <summary>Review details</summary>
        <p>
          {take.kind === "video"
            ? `Visual checks sample frames at ${take.continuity?.sampleFps || 24} fps. They can miss subtle changes and do not guarantee an identical face.`
            : "The visual check compares visible features with the saved reference views; it is not biometric identity verification."}
        </p>
        {take.continuity?.checks?.map((check) => (
          <p key={check.characterId}>
            <strong>
              {
                take.identity?.find(
                  (item) => item.characterId === check.characterId,
                )?.name
              }
            </strong>
            : {check.notes}
            {check.timestamps?.length
              ? ` (${check.timestamps.join(", ")})`
              : ""}
          </p>
        ))}
      </details>
      {status !== "passed" && (
        <button className="studio-btn" disabled={busy} onClick={onReview}>
          {status === "pending"
            ? "Check appearance now"
            : "Retry appearance check"}
        </button>
      )}
    </div>
  );
}
