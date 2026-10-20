"use client";

import { sceneSpeechGuidance, wordBudget } from "@/lib/film/dialogue";
import type { FilmLanguage, StudioScene } from "@/types/studio";

export function SpeechGuidance({ scene, language, seconds, options = [], id }: {
  scene: Pick<StudioScene, "dialogues">; language: FilmLanguage; seconds: number;
  options?: readonly number[]; id?: string;
}) {
  const fit = sceneSpeechGuidance(scene, language, seconds, options);
  return <div id={id} role="status" aria-live="polite" aria-atomic="true"
    className={`mt-3 rounded-lg border p-3 text-xs leading-5 ${fit.overBudget ? "border-amber-600/50 bg-amber-50 text-amber-950" : "border-[var(--line)] text-[var(--muted)]"}`}>
    <p><strong>{seconds}s scene: aim for about {fit.budgetWords} spoken words total</strong> across all speakers. This leaves room for action and pauses.</p>
    <p>{fit.words} words · about {fit.estimatedSeconds.toFixed(1)}s of speech (estimated); {fit.budgetSeconds.toFixed(1)}s available.</p>
    {fit.overBudget ? <p className="mt-1 font-medium">This dialogue is estimated not to fit a {seconds}s video. Shorten it, split the scene{fit.suggestedSeconds ? `, or choose ${fit.suggestedSeconds}s or longer` : ", or move some dialogue to another scene"}. Video generation is blocked until it fits.</p>
      : <p>About {fit.remainingWords} more spoken words fit. Delivery speed and pauses can change the actual timing.</p>}
  </div>;
}

/** A pasted script contains action and headings as well as speech; do not count it all as dialogue. */
export function ScriptLengthGuidance({ language, seconds, sceneCount }: {
  language: FilmLanguage; seconds: number; sceneCount?: number;
}) {
  return <p className="film-help">Each scene becomes one {seconds}s video. Aim for about {wordBudget(language, seconds)} spoken words per scene across all speakers, with time for action and pauses.
    {sceneCount ? ` You selected ${sceneCount} scene${sceneCount === 1 ? "" : "s"}, about ${sceneCount * seconds}s in total.` : " Omni can divide your script into scenes."}
    {" "}Action descriptions and scene headings are not spoken and do not use this word budget. Dialogue timing is estimated per scene after the script is organised; you can shorten, split or lengthen a scene before rendering.</p>;
}
