"use client";

import { useEffect, useState } from "react";
import { readStudioEntry, studioEntryFromPath } from "@/lib/studio/entry";

export function StudioEntryNotice({ nextPath }: { nextPath: string }) {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  useEffect(() => {
    let active = true;
    const entry = readStudioEntry(studioEntryFromPath(nextPath));
    setMessage(entry?.text || "");
    setReply("");
    if (entry?.guestProjectId)
      void fetch("/api/studio/guest", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (active && data?.id === entry.guestProjectId)
            setReply(
              [...data.state.messages]
                .reverse()
                .find(
                  (message: { role: string; text: string }) =>
                    message.role === "assistant",
                )?.text || "",
            );
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [nextPath]);
  if (!message) return null;
  return (
    <aside className="public-entry-notice" aria-label="Your saved story idea">
      <strong>Your idea is coming with you.</strong>
      <p>{message.length > 180 ? `${message.slice(0, 180)}…` : message}</p>
      {reply && (
        <details className="public-entry-reply" open>
          <summary>Your director's latest reply</summary>
          <p>{reply}</p>
        </details>
      )}
      <span>Sign up or log in. Your director will take it from here.</span>
    </aside>
  );
}
