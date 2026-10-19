"use client";

import { useEffect, useState } from "react";
import { FILM_LANGUAGES } from "@/lib/film/language";
import { readStudioEntry, studioEntryFromPath, type StudioEntry } from "@/lib/studio/entry";

/**
 * Confirms, on the sign-in and sign-up pages, that the visitor's work survives.
 *
 * The idea never leaves their browser until the account exists, so this reads it
 * from local storage using the opaque id in `?next=`. It reassures them that
 * signing in is not going to lose what they just did — including the setup
 * choices, which are applied to the film they land on.
 */
export function StudioEntryNotice({ nextPath }: { nextPath: string }) {
  const [entry, setEntry] = useState<StudioEntry | null>(null);
  useEffect(() => {
    setEntry(readStudioEntry(studioEntryFromPath(nextPath)));
  }, [nextPath]);
  if (!entry?.text) return null;
  const language = FILM_LANGUAGES.find((item) => item.id === entry.setup?.language);
  const details = [
    entry.setup?.assist ? `${entry.setup.assist === "guided" ? "Guided" : "Custom"} mode` : null,
    language?.label,
    entry.setup?.clipSeconds ? `${entry.setup.clipSeconds}s clips` : null,
    entry.setup?.visualStyle,
  ].filter(Boolean) as string[];
  return (
    <aside className="public-entry-notice" aria-label="Your saved story idea">
      <strong>Your story is coming with you.</strong>
      <p>{entry.text.length > 180 ? `${entry.text.slice(0, 180)}…` : entry.text}</p>
      {details.length ? <small>{details.join(" · ")}</small> : null}
    </aside>
  );
}
