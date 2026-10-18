"use client";

import { ArrowRight, Download, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { StudioMessage } from "@/types/studio";
import { ContinuityCheck } from "./continuity-check";

export function DirectorTools({
  message,
  projectId,
  disabled,
  onChoose,
  onRetry,
  onRefresh,
  onSaveReference,
  onReview,
}: {
  message: StudioMessage;
  projectId: string | null;
  disabled: boolean;
  onChoose: (text: string) => void;
  onRetry: () => void;
  onRefresh: () => void;
  onSaveReference: (name: string) => void;
  onReview: () => void;
}) {
  const [name, setName] = useState("");
  const image = message.image;
  const waiting =
    image &&
    (["queued", "rendering"].includes(image.status) ||
      (image.status === "complete" && !image.url));
  const ready = image?.status === "complete" && image.url;
  const failed =
    message.imageError ||
    image?.error ||
    (image &&
    ["error", "failed", "canceled", "cancelled"].includes(image.status)
      ? "The image could not be generated. Try again or revise your request."
      : "");
  const src = projectId
    ? `/api/studio/${encodeURIComponent(projectId)}/media?messageId=${encodeURIComponent(message.id)}`
    : "";
  return (
    <>
      {!!message.choices?.length && (
        <div
          className="studio-choices"
          role="group"
          aria-label="Choose a direction"
        >
          {message.choices.map((choice, index) => (
            <button
              key={`${index}-${choice.label}`}
              className="studio-choice"
              disabled={disabled}
              onClick={() => onChoose(choice.message)}
            >
              <span className="studio-choice-title">
                <strong>{choice.label}</strong>
                <ArrowRight size={15} />
              </span>
              {choice.description && (
                <span className="studio-choice-description">
                  {choice.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {message.imageRequest && (
        <figure className="studio-chat-image" aria-label="Requested image">
          {ready && (
            <img
              src={src}
              alt="Image created from your request"
              loading="lazy"
            />
          )}
          {waiting && (
            <div className="studio-image-wait" role="status">
              <Loader2 className="studio-spinner" size={20} />
              <span>Creating your image…</span>
            </div>
          )}
          {failed && (
            <p role="alert" className="studio-image-error">
              {failed}
            </p>
          )}
          <figcaption>
            {image && (
              <ContinuityCheck
                take={image}
                busy={disabled}
                onReview={onReview}
              />
            )}
            {ready &&
              ["failed", "review"].includes(image.continuity?.status || "") && (
                <button
                  className="studio-btn"
                  disabled={disabled}
                  onClick={() =>
                    onChoose(
                      `Generate a revised image of ${image.identity?.map((item) => item.name).join(" and ") || "the subject"}. Follow my last image request and locked references. Correct these visual issues: ${image.continuity?.checks?.map((check) => check.notes.slice(0, 700)).join("; ") || "Make the character clearly visible for comparison."}`,
                    )
                  }
                >
                  Generate revised image
                </button>
              )}
            {ready && (
              <a
                className="studio-btn"
                href={src}
                download={`director-${image.id}.png`}
              >
                <Download size={14} /> Download image
              </a>
            )}
            {waiting || (ready && image.error) ? (
              <button
                className="studio-btn"
                disabled={disabled}
                onClick={onRefresh}
              >
                <RefreshCw size={14} /> Refresh image status
              </button>
            ) : null}
            {!waiting && !ready && (
              <button
                className="studio-btn"
                disabled={disabled}
                onClick={onRetry}
              >
                <RefreshCw size={14} /> Retry image generation
              </button>
            )}
            {ready && (
              <details className="studio-save-reference">
                <summary>Use as a character reference</summary>
                <p>
                  Name the character, then review and lock its appearance on the
                  project board. An existing name adds this image as another
                  reference view.
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (name.trim()) onSaveReference(name.trim());
                  }}
                >
                  <input
                    aria-label="Generated character name"
                    placeholder="Character name"
                    maxLength={100}
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={disabled}
                  />
                  <button
                    className="studio-btn"
                    disabled={disabled || !name.trim()}
                  >
                    Save reference
                  </button>
                </form>
              </details>
            )}
            <details>
              <summary>Image prompt</summary>
              <p>{message.imageRequest.prompt}</p>
            </details>
          </figcaption>
        </figure>
      )}
    </>
  );
}
