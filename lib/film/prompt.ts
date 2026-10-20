import type {
  FilmLanguage,
  StudioCharacter,
  StudioDialogue,
  StudioScene,
  StudioState,
} from "@/types/studio";
import { spokenDialogue } from "@/types/studio";
import { estimateSpokenSeconds } from "./dialogue";

/** Official guidance: https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide */
export const LTX_PROMPT_GUIDANCE = "Write LTX 2.5 prompts as chronological, present-tense cinematic prose. Establish the shot, scene, concrete action, recurring subjects, camera movement and audio. For image-to-video let the approved opening image define appearance and composition; focus on motion and sound instead of reimagining it. Prefer one continuous shot, one coherent lighting setup and plausible actions. For requested multi-shot scenes prefer two to four shots with explicit prose transitions, repeated subject descriptors and audio continuity. Preserve exact quoted dialogue and named speakers. Add essential titles in post-production. Do not invent speech or add unrequested cuts.";

/**
 * Builds the generation prompt for one clip.
 *
 * A clip is always ONE source video. When a scene has beats, those beats are
 * cuts *inside* that one video, described as chronological prose with explicit
 * cut markers — not as pipe-separated fragments, and not as several jobs. The
 * editor splits the resulting video at the cuts afterwards.
 */

export type ResolvedBeat = {
  id: string;
  visualAction: string;
  lines: StudioDialogue[];
  startSeconds: number;
  endSeconds: number;
};

/** A short distinguishing phrase, repeated at each cut so identity holds. */
export function shortDescriptor(appearance: string) {
  const first = appearance.trim().split(/(?<=[.;])\s+/)[0] || appearance.trim();
  return first.length > 140 ? `${first.slice(0, 137).trimEnd()}…` : first;
}

function linesFor(scene: StudioScene, ids: string[] | undefined) {
  const spoken = spokenDialogue(scene);
  if (!ids) return spoken;
  const byId = new Map(spoken.map((line) => [line.id, line]));
  return ids.map((id) => byId.get(id)).filter((line): line is StudioDialogue => Boolean(line));
}

/**
 * Lays the scene out on the clip's timeline.
 *
 * Beat lengths are weighted by how much speech each beat carries, with a floor
 * so a silent beat still gets screen time. The resulting times are a direction
 * to the model, not a guarantee — the measured take length is what the editor
 * and export use.
 */
export function resolveBeats(
  scene: StudioScene,
  language: FilmLanguage,
  clipSeconds: number,
): ResolvedBeat[] {
  const beats = scene.beats?.length
    ? scene.beats
    : [{ id: scene.id, visualAction: scene.visualAction ?? scene.description ?? "", dialogueIds: undefined }];
  const resolved = beats.map((beat) => ({
    id: beat.id,
    visualAction: beat.visualAction || scene.visualAction || scene.description || "",
    lines: linesFor(scene, beat.dialogueIds),
  }));
  const weights = resolved.map(
    (beat) =>
      Math.max(
        0.6,
        beat.lines.reduce((total, line) => total + estimateSpokenSeconds(line.text, language), 0),
      ),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  return resolved.map((beat, index) => {
    const span = (weights[index] / total) * clipSeconds;
    const startSeconds = cursor;
    cursor = index === resolved.length - 1 ? clipSeconds : cursor + span;
    return { ...beat, startSeconds, endSeconds: cursor };
  });
}

function castBlock(cast: StudioCharacter[]) {
  if (!cast.length) return "";
  return `The cast is ${cast.map(character => `${character.name}, ${character.appearance}`).join("; ")}.`;
}

function speechLine(
  line: StudioDialogue,
  cast: StudioCharacter[],
  language: FilmLanguage,
) {
  const character = cast.find((item) => item.name === line.character);
  // The descriptor is repeated at every cut on purpose: it is what keeps the
  // same face on the same voice across a cut.
  const detail = character ? ` (${shortDescriptor(character.appearance)})` : "";
  const tongue = language === "ur" ? " in Urdu" : "";
  return `${line.character}${detail} says exactly${tongue}: ${JSON.stringify(line.text)}`;
}

function audioDirection(
  language: FilmLanguage,
  hasSpeech: boolean,
  multiShot: boolean,
  suppliedSpeech: boolean,
) {
  const continuity = multiShot
    ? " One single mixed soundtrack runs across the whole video: ambience and score continue unbroken through every cut, with no silence, no restart and no level jump at a cut."
    : "";
  if (!hasSpeech) {
    // Deliberately unconditional. The older wording ("unless explicitly
    // requested") left an opening the model could take.
    return `\nSound: this video contains NO speech of any kind. No dialogue, no voiceover, no narration, no whispering, singing, chanting, crowd chatter and no off-screen or background voices. Generate only environmental sound and, if it suits the scene, a quiet score. Do not render subtitles or captions.${continuity}`;
  }
  if (suppliedSpeech) {
    return `\nSound: the speech track is supplied and must be preserved exactly as given — do not re-speak, re-time, translate, extend or add to it. Match mouth movement to the supplied speech. Add only environmental sound and, if it suits the scene, a quiet score kept well under the voice. Do not add any other voice. Do not render subtitles or captions.${continuity}`;
  }
  return `\nSound: generate synchronized speech for exactly the lines written above and nothing else — no invented dialogue, no extra speakers, no voiceover and no narration. Keep speech intelligible with environmental sound and any score underneath it. Follow the written delivery, music and sound cues. Do not render subtitles or captions.${continuity}`;
}

export type FilmPromptInput = {
  imageConditioned?: boolean;
  state: Pick<StudioState, "world" | "visualStyle" | "characters"> & Partial<Pick<StudioState, "scenes">>;
  scene: StudioScene;
  language: FilmLanguage;
  /** The length actually being requested, already snapped to the frame grid. */
  clipSeconds: number;
  /** True on the Urdu path, where speech is sent to the worker as audio. */
  suppliedSpeech?: boolean;
  /** Extra direction, e.g. defect corrections from a rejected take. */
  instructions?: string;
};

export function buildFilmPrompt({
  state,
  scene,
  language,
  clipSeconds,
  suppliedSpeech = false,
  instructions,
  imageConditioned = false,
}: FilmPromptInput) {
  const cast = state.characters.filter((character) => scene.characterIds.includes(character.id));
  const beats = resolveBeats(scene, language, clipSeconds);
  const multiShot = beats.length > 1;
  const hasSpeech = beats.some((beat) => beat.lines.length > 0);
  const style = (state.visualStyle || state.world || "").trim();
  const direction = sceneDirectionText(state, scene);
  const length = clipSeconds.toFixed(1);

  const header = multiShot
    ? `This is one ${length}-second scene at 24 frames per second, with ${beats.length} connected shots in chronological order.`
    : `This is ONE continuous ${length}-second take at 24 frames per second, with no cuts.`;

  const body = beats
    .map((beat, index) => {
      const label = index === 0 ? "The shot opens as" : "A hard cut transitions to the next view as";
      const speech = beat.lines.map((line) => speechLine(line, cast, language)).join(". ");
      const returning = multiShot && index > 0 && cast.length ? ` The same ${cast.map(character => `${character.name} (${shortDescriptor(character.appearance)})`).join(" and ")} retain their established appearance; the ambience and score continue across the cut.` : "";
      return `${label} ${beat.visualAction}${speech ? ` ${speech}.` : " No one speaks during this shot."}${returning}`;
    })
    .join(" ");

  return [
    header,
    imageConditioned ? "The approved first-frame image establishes the composition, location, faces, wardrobe, props and lighting. Animate that image with the following actions while preserving its established appearance." : "",
    style && !imageConditioned ? `Visual style: ${style}` : "",
    imageConditioned ? "" : castBlock(cast),
    imageConditioned ? "" : precedingSceneContext(state, scene),
    direction,
    body,
    audioDirection(language, hasSpeech, multiShot, suppliedSpeech),
    multiShot
      ? "\nKeep every character's face, hair, outfit and distinctive details identical on both sides of every cut, and keep lighting, location and weather continuous unless a shot above says otherwise."
      : "",
    instructions ? `\nDirector's requirements:\n${instructions}` : "",
  ]
    .filter(Boolean)
    .join(" ").replace(/\s+/g, " ")
    .trim();
}

/** Shared by image composition and video generation. */
export function sceneDirectionText(state: Pick<StudioState, "characters">, scene: StudioScene) {
  const direction = scene.direction;
  if (!direction) return "";
  const cues = Object.entries(direction).filter(([key, value]) => key !== "background" && typeof value === "string" && value.trim())
    .map(([key, value]) => `${key}: ${value}`);
  // Per-character cues only for people actually cast in this scene.
  const named = (map?: Record<string, string>) => Object.entries(map ?? {}).flatMap(([id, value]) => {
    const character = state.characters.find(item => item.id === id && scene.characterIds.includes(id));
    return character && value.trim() ? [`${character.name}: ${value}`] : [];
  });
  const wardrobe = named(direction.wardrobe);
  const expression = named(direction.expression);
  const background = direction.background?.trim();
  return [cues.length ? `Scene direction (visual and sound cues, never spoken): ${cues.join("; ")}.` : "",
    wardrobe.length ? `Intentional wardrobe / styling in THIS scene only: ${wardrobe.join("; ")}. This overrides reference clothing only. Preserve locked facial proportions, age, hair and distinctive identity details.` : "",
    expression.length ? `Expressions and body language in THIS scene: ${expression.join("; ")}. Expression never changes a character's identity.` : "",
    background ? `Background (silent extras only, never named characters, never speaking): ${background}.` : ""].filter(Boolean).join("\n");
}

export function precedingSceneContext(state: Partial<Pick<StudioState, "scenes">>, scene: StudioScene) {
  const index = state.scenes?.findIndex(item => item.id === scene.id) ?? -1;
  const previous = index > 0 ? state.scenes?.[index - 1] : undefined;
  if (!previous) return "";
  return `Continuity from the preceding scene (context only; do not repeat its action or speech): ${previous.title}. ${(previous.visualAction || previous.description).slice(0, 1000)}. Established setting / props / wardrobe: ${JSON.stringify(previous.direction ?? {})}. Preserve established details unless THIS scene explicitly changes them. Only dialogue listed for THIS scene is spoken.`;
}
