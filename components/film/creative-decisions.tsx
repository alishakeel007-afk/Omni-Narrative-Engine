"use client";

import { useEffect, useState } from "react";
import type { SceneDirection, StudioScene, StudioState } from "@/types/studio";
import type { DecisionPage } from "./decision-flow";
import { FieldAssist } from "./field-assist";

const SCENE_FIELDS: [keyof Omit<SceneDirection, "wardrobe">, string, string][] = [
  ["location", "Where are we?", "The place should follow naturally from this story and its previous scene."],
  ["timeOfDay", "What time is it?", "Set the time of day, or leave it to the existing scene."],
  ["lighting", "How is it lit?", "Describe the light and the mood it gives this moment."],
  ["props", "Which objects matter?", "Keep track of anything a character holds, uses, or carries between scenes."],
  ["camera", "Where is the camera?", "A wide view, a close-up, or a gentle movement can change how this moment feels."],
  ["delivery", "How are the words spoken?", "Set the emotion and pace of the dialogue."],
  ["music", "Does this moment need music?", "Describe a mood, or write ‘No music’."],
  ["ambience", "What does the place sound like?", "Background sounds can make your setting feel alive."],
  ["soundEffects", "Any specific sounds?", "Add only the sounds that matter to the action."],
];

function DirectionAnswer({ projectId, scene, state, field, label, value, onSave, characterId }: {
  projectId: string; scene: StudioScene; state: StudioState; field: keyof SceneDirection;
  label: string; value: string; onSave: (value: string) => Promise<boolean>;
  characterId?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <><textarea className="decision-input" aria-label={label} rows={3} maxLength={field === "timeOfDay" ? 200 : 1000} value={draft}
    onChange={event => setDraft(event.target.value)} onBlur={() => { if (draft !== value) void onSave(draft); }} placeholder="Your direction, or leave open" />
    <FieldAssist projectId={projectId} state={state} sceneId={scene.id} characterId={characterId} field={field} label={label.toLowerCase()} value={draft}
      onAccept={answer => { setDraft(answer); return onSave(answer); }} /></>;
}

export function sceneDecisionPages({ scene, state, projectId, onSave }: {
  scene: StudioScene; state: StudioState; projectId: string; onSave: (patch: Record<string, unknown>) => Promise<boolean>;
}) {
  const pages: DecisionPage[] = SCENE_FIELDS.map(([field, title, description]) => ({ id: field, title, description, optional: true,
    content: <DirectionAnswer key={field} projectId={projectId} state={state} scene={scene} field={field} label={field === "soundEffects" ? "Sound effects" : field === "timeOfDay" ? "Time of day" : field[0].toUpperCase() + field.slice(1)} value={scene.direction?.[field] ?? ""} onSave={value => onSave({ direction: { [field]: value } })} /> }));
  for (const character of state.characters.filter(item => scene.characterIds.includes(item.id))) pages.push({ id: `wardrobe:${character.id}`, title: `What is ${character.name} wearing?`, description: "This outfit applies to this scene only. Their face, age, hair and identity stay locked.", optional: true,
    content: <DirectionAnswer key={character.id} characterId={character.id} projectId={projectId} state={state} scene={scene} field="wardrobe" label={`${character.name}: wardrobe`} value={scene.direction?.wardrobe?.[character.id] ?? ""} onSave={value => onSave({ direction: { wardrobe: { [character.id]: value } } })} /> });
  const index = state.scenes.findIndex(item => item.id === scene.id);
  return pages.map(page => ({ ...page, id: `${scene.id}:${page.id}`, title: `Scene ${index + 1} · ${page.title}`, skipTo: `${scene.id}:shots`, skipLabel: "Skip scene details" }));
}
