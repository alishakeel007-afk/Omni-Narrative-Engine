import { createHash, randomUUID } from "node:crypto";
import { precedingSceneContext, sceneDirectionText } from "@/lib/film/prompt";
import { imageBackend } from "./image-backend";
import type {
  StudioChoice,
  StudioImageRequest,
  StudioPlan,
  StudioState,
} from "@/types/studio";
import {
  characterReferences,
  identityProfile,
  conditioningReferences,
} from "./identity";

export function isImageRequest(text: string) {
  if (/\b(?:how\s+(?:do|can|to|would)|can i|could i|explain)\b/i.test(text))
    return false;
  if (
    /\b(?:do not|don't|never|not yet|not asking you to)\b[^.!?;\n]{0,35}\b(?:generate|create|draw|make|render|show|give|want|need)\b/i.test(
      text,
    )
  )
    return false;
  if (
    /\b(?:generate|create|draw|make|render)\b[^.!?;\n]{0,100}\b(?:later|tomorrow|next time|not now)\b/i.test(
      text,
    )
  )
    return false;
  return (
    /\b(?:generate|create|draw|make|render|show|give|want|need|would like|i'd like|i'd love)\b[\s\S]{0,140}\b(?:photos?|photographs?|images?|pictures?|portraits?|illustrations?|artwork)\b/i.test(
      text,
    ) ||
    /\b(?:portrait|photo|image|picture|illustration) of\b[\s\S]{0,140}\bplease\b/i.test(
      text,
    )
  );
}

export function chatImageRequest(
  state: StudioState,
  text: string,
  proposal?: { prompt: string; characterNames: string[] } | null,
  sceneId?: string,
): {
  request?: StudioImageRequest;
  choices?: StudioChoice[];
  blockedReason?: string;
} {
  if (!isImageRequest(text)) return {};
  // A model image action handles natural phrasing; the fallback only handles
  // direct commands, so quoted material in a pasted script cannot trigger a job.
  if (
    !proposal &&
    !/^(?:(?:please|can you|could you|would you)\s+)?(?:generate|create|draw|make|render|show|give)\b/i.test(
      text.trim(),
    )
  )
    return {};
  const draft = [...state.messages]
    .reverse()
    .find((message) => message.plan)?.plan;
  const known: {
    name: string;
    appearance: string;
    locked?: boolean;
    referenceId?: string;
    id?: string;
    references?: { id: string; label: string }[];
  }[] = [
    ...state.characters,
    ...(draft?.characters || []).filter(
      (item) =>
        !state.characters.some(
          (saved) => saved.name.toLowerCase() === item.name.toLowerCase(),
        ),
    ),
  ];
  let cast = known.filter(
    (character) =>
      proposal?.characterNames.some(
        (name) => name.toLowerCase() === character.name.toLowerCase(),
      ) ||
      new RegExp(
        `\\b${character.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      ).test(text),
  );
  const selected = state.scenes.find((scene) => scene.id === sceneId);
  if (!cast.length && /\b(?:character|him|her|his|portrait)\b/i.test(text)) {
    if (known.length === 1) cast = known;
    else if (known.length > 1)
      return {
        choices: known.slice(0, 4).map((character) => ({
          label: character.name,
          description: character.appearance.slice(0, 150),
          message: `Generate a portrait of ${character.name}.`,
        })),
      };
  }
  if (!cast.length && selected && /\b(?:this|the|selected) scene\b/i.test(text))
    cast = state.characters.filter((character) =>
      selected.characterIds.includes(character.id),
    );
  if (
    cast.some(
      (character) =>
        character.id &&
        !character.locked &&
        characterReferences(
          character as import("@/types/studio").StudioCharacter,
        ).length,
    )
  )
    return {
      blockedReason:
        "Review and lock the character's updated reference views in Characters before generating another image. This keeps an unlocked profile from silently becoming a text-only render.",
    };
  const referenceLimit = imageBackend().referenceLimit;
  if (
    cast.filter((character) => character.locked && character.id).length >
    referenceLimit
  )
    return {
      blockedReason: `Split the shot into groups of ${referenceLimit} characters or fewer so each character can receive a reference input.`,
    };
  return {
    request: {
      variation: state.messages.filter((message) => message.image).length,
      prompt: `${proposal?.prompt || text}\n${selected && /\bscene\b/i.test(text) ? `Scene context: ${selected.description}\n` : ""}World and visual style: ${state.world || draft?.world || "Follow the requested style."}\nCharacter continuity: ${cast.map((character) => `${character.name}: ${character.appearance}`).join("\n")}\nPreserve the identity, facial structure, hair and distinctive details of any supplied reference. No text overlays.`,
      referenceIds: conditioningReferences(
        cast
          .filter((character) => character.locked && character.id)
          .map((character) =>
            identityProfile(
              character as import("@/types/studio").StudioCharacter,
            ),
          ),
        referenceLimit,
      ),
      identity: cast
        .filter(
          (character) =>
            character.locked &&
            character.id &&
            characterReferences(
              character as import("@/types/studio").StudioCharacter,
            ).length,
        )
        .map((character) =>
          identityProfile(
            character as import("@/types/studio").StudioCharacter,
          ),
        ),
    },
  };
}

export function approvePlan(state: StudioState, plan: StudioPlan): StudioState {
  const characters = [...state.characters];
  for (const proposed of plan.characters) {
    const found = characters.find(
      (character) =>
        character.name.toLowerCase() === proposed.name.toLowerCase(),
    );
    if (!found)
      characters.push({ ...proposed, id: randomUUID(), locked: false });
    else if (!found.locked) found.appearance = proposed.appearance;
  }
  const scenes = plan.scenes.map((scene, index) => {
    const previous = state.scenes[index];
    const changed =
      !!previous &&
      (previous.description !== scene.description ||
        JSON.stringify(
          previous.dialogues.map(({ character, text }) => ({
            character,
            text,
          })),
        ) !== JSON.stringify(scene.dialogues));
    return {
      id: previous?.id || randomUUID(),
      title: scene.title,
      description: scene.description,
      characterIds: scene.characters
        .map(
          (name) =>
            characters.find(
              (character) =>
                character.name.toLowerCase() === name.toLowerCase(),
            )?.id,
        )
        .filter((id): id is string => !!id),
      dialogues: changed
        ? scene.dialogues
        : scene.dialogues.map((line, i) => ({
            ...line,
            audioUrl: previous?.dialogues[i]?.audioUrl,
          })),
      takes: previous?.takes || [],
      selectedImageId: previous?.selectedImageId,
      selectedVideoId: previous?.selectedVideoId,
      musicUrl: previous?.musicUrl,
      outdated: changed || previous?.outdated,
    };
  });
  return {
    ...state,
    title: plan.title,
    premise: plan.premise,
    world: plan.world,
    characters,
    scenes,
    timeline: state.timeline.filter((id) =>
      scenes.some((scene) => scene.id === id),
    ),
  };
}
export function scenePrompt(state: StudioState, sceneId: string) {
  const scene = state.scenes.find((scene) => scene.id === sceneId);
  if (!scene) throw new Error("Scene not found.");
  const cast = state.characters.filter((character) =>
    scene.characterIds.includes(character.id),
  );
  return {
    scene,
    cast,
    continuityKey: createHash("sha256")
      .update(
        JSON.stringify({
          description: scene.description,
          direction: scene.direction,
          continuityContext: precedingSceneContext(state, scene),
          world: state.world,
          cast: cast.map((character) => ({
            ...identityProfile(character),
            locked: character.locked,
          })),
        }),
      )
      .digest("hex"),
    prompt: `${scene.description}\n${precedingSceneContext(state, scene)}\n${sceneDirectionText(state, scene)}\nWorld and visual style: ${state.world}\nCharacter descriptions: ${cast.map((character) => `${character.name}: ${character.appearance}`).join("\n")}\nUse image references only for characters whose appearance is locked. Preserve their facial proportions, hairline, hair texture, visible markings, silhouette and approved outfit across views unless this scene explicitly specifies a wardrobe change. For characters without a reference image, create their look from their written description and keep it coherent within this scene. Do not blend characters. Keep movement natural and restrained; no face morphing, age changes, hairstyle changes or outfit substitutions. Compose the requested scene with appropriate framing and setting. No text overlays or subtitles.`,
  };
}
