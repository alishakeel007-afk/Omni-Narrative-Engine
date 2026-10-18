/** Canonical, inspectable visual planning for Guided and Custom images. */

export type VisualCharacterProfile = { id?: string; name: string; appearance?: string; role?: string; personalityTone?: string };
export type VisualSceneInput = {
  id?: string; title: string; narration?: string; storyDescription?: string; selectedSuggestion?: string;
  imagePrompt?: string; visualPrompt?: string; directorNotes?: string; location?: string; mood?: string;
  dialogueCharacterNames?: string[]; activeCharacterIds?: string[];
  visualDirection?: SceneVisualDirection;
};
export type SceneVisualDirection = {
  primaryLocation?: string;
  composition?: string;
  requiredEvent?: string;
  visibleCharacterIds?: string[];
};
export type SceneVisualBrief = {
  sceneId?: string; sceneTitle: string; primaryLocation: string;
  interiorOrExterior: "interior" | "exterior" | "mixed" | "unspecified"; timeOfDay?: string;
  presentCharacterIds: string[]; presentCharacterNames: string[]; canonicalCharacterAppearances: string[];
  visibleCharacterActions: string[]; requiredVisualEvents: string[]; essentialObjects: string[];
  compositionAndCamera: string; continuityConstraints: string[]; excludedCharacters: string[];
  negativeConstraints: string[]; warnings: string[];
};

function compact(value: string | undefined, max = 420) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
function unique(values: string[]) {
  return [...new Map(values.filter(Boolean).map((value) => [value.toLocaleLowerCase(), value])).values()];
}
function nameIsMentioned(name: string, text: string) {
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Boolean(escaped) && new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text);
}
const INTERIOR_CUES = /\b(interior|inside|indoors?|workshop|laboratory|lab|room|office|studio|apartment|house|hall|chamber|corridor|library|station|cockpit|warehouse|basement|bunker|temple|cave)\b/i;
const EXTERIOR_CUES = /\b(exterior|outside|outdoors?|street|rooftop|roof|skyline|alley|forest|desert|beach|garden|plaza|courtyard|balcony|mountain|field|citywide|city)\b/i;
const SKY_EVENT_CUES = /\b(sky|skyline|blackout|tower|rooftop|citywide|city)\b/i;
const TIME_CUES: Array<[RegExp, string]> = [[/\b(night|midnight|moonlit|darkness)\b/i, "night"], [/\b(dawn|sunrise)\b/i, "dawn"], [/\b(dusk|sunset|evening)\b/i, "dusk"], [/\b(day|daylight|morning|afternoon)\b/i, "day"]];

function sentences(value: string | undefined, limit: number) {
  return compact(value, 900).split(/(?<=[.!?])\s+|\n+/).map((sentence) => compact(sentence, 260)).filter(Boolean).slice(0, limit);
}
function inferSetting(location: string, facts: string) {
  const interior = INTERIOR_CUES.test(location) || INTERIOR_CUES.test(facts);
  const exterior = EXTERIOR_CUES.test(location) || EXTERIOR_CUES.test(facts) || SKY_EVENT_CUES.test(facts);
  return interior && exterior ? "mixed" as const : interior ? "interior" as const : exterior ? "exterior" as const : "unspecified" as const;
}

/** Build a concise brief from authored canonical content; it never copies a prior setting. */
export function buildSceneVisualContext(input: { scene: VisualSceneInput; characters: VisualCharacterProfile[]; priorScene?: Pick<VisualSceneInput, "title" | "location" | "imagePrompt" | "visualPrompt"> }) {
  const { scene } = input;
  const authoredFacts = [scene.narration, scene.storyDescription, scene.selectedSuggestion, scene.imagePrompt, scene.visualPrompt, scene.directorNotes].filter(Boolean) as string[];
  const sceneText = [scene.title, ...authoredFacts].join("\n");
  const dialogueNames = unique((scene.dialogueCharacterNames ?? []).map((name) => name.trim()));
  const activeIds = new Set(scene.activeCharacterIds ?? []);
  const approvedVisibleIds = scene.visualDirection?.visibleCharacterIds;
  const presentCharacters = input.characters.filter((character) => approvedVisibleIds
    ? Boolean(character.id && approvedVisibleIds.includes(character.id))
    : (character.id ? activeIds.has(character.id) : false) || nameIsMentioned(character.name, sceneText));
  const characterNames = unique(presentCharacters.map((character) => character.name));
  const appearances = presentCharacters.flatMap((character) => {
    const appearance = compact(character.appearance, 260);
    if (appearance) return [`${character.name}: ${appearance.replace(/^\s*[^:]{1,80}:\s*/, "")}`];
    const identity = [character.role, character.personalityTone].map((value) => compact(value, 100)).filter(Boolean).join(", ");
    return identity ? [`${character.name}: ${identity}`] : [];
  });
  const requiredEvents = unique([scene.visualDirection?.requiredEvent, scene.narration, scene.storyDescription, scene.selectedSuggestion, scene.imagePrompt, scene.visualPrompt].flatMap((value) => sentences(value, 3))).slice(0, 4);
  const facts = [sceneText, ...requiredEvents].join("\n");
  const sourceLocation = compact(scene.location, 180) || "Use the authored story setting";
  const eventNeedsExterior = SKY_EVENT_CUES.test(facts) || EXTERIOR_CUES.test(facts);
  const approvedLocation = compact(scene.visualDirection?.primaryLocation, 180);
  const primaryLocation = approvedLocation || (eventNeedsExterior && INTERIOR_CUES.test(sourceLocation)
    ? "Exterior view required by the authored story event"
    : sourceLocation);
  const interiorOrExterior = eventNeedsExterior && !approvedLocation ? "exterior" : inferSetting(primaryLocation, facts);
  const warnings: string[] = [];
  if (INTERIOR_CUES.test(sourceLocation) && eventNeedsExterior && !approvedLocation) warnings.push("The indoor background location was superseded for this image because the required story event needs a visible exterior view.");
  if (EXTERIOR_CUES.test(primaryLocation) && INTERIOR_CUES.test(facts) && !SKY_EVENT_CUES.test(facts)) warnings.push("The location and story facts imply different settings. Review the scene location or visual prompt before generation.");
  if (requiredEvents.length === 0) warnings.push("No concrete visual event is authored yet; add narration or a visual prompt before generation.");
  const priorScene = input.priorScene;
  const returning = priorScene ? characterNames.filter((name) => nameIsMentioned(name, [priorScene.title, priorScene.imagePrompt, priorScene.visualPrompt].filter(Boolean).join("\n"))) : [];
  const continuityConstraints = returning.length ? [`Keep only the canonical appearance of returning characters: ${returning.join(", ")}.`] : [];
  const brief: SceneVisualBrief = {
    sceneId: scene.id, sceneTitle: compact(scene.title, 140) || "Untitled scene", primaryLocation, interiorOrExterior,
    timeOfDay: TIME_CUES.find(([pattern]) => pattern.test(facts))?.[1], presentCharacterIds: presentCharacters.flatMap((character) => character.id ? [character.id] : []), presentCharacterNames: characterNames,
    canonicalCharacterAppearances: appearances,
    visibleCharacterActions: characterNames.flatMap((name) => requiredEvents.filter((fact) => nameIsMentioned(name, fact)).map((fact) => `${name}: ${fact}`)).slice(0, 4),
    requiredVisualEvents: requiredEvents,
    essentialObjects: unique(requiredEvents.flatMap((event) => event.match(/\b(tower|machine|laboratory|sky|city|blackout|device|door|artifact)\b/gi) ?? [])).slice(0, 6),
    compositionAndCamera: compact(scene.visualDirection?.composition, 280) || (interiorOrExterior === "mixed" ? "Frame the authored setting and the required exterior event together; keep the defining event clearly visible." : "Frame the required event and present characters clearly before atmospheric decoration."),
    continuityConstraints,
    excludedCharacters: input.characters.filter((character) => !characterNames.some((name) => name.toLocaleLowerCase() === character.name.toLocaleLowerCase())).map((character) => character.name),
    negativeConstraints: ["unrelated setting", "unlisted protagonists", "text, watermark, logo"], warnings,
  };
  return { imagePrompt: requiredEvents.join(" ") || `Scene: ${brief.sceneTitle}.`, visualPrompt: compact(scene.visualPrompt || scene.directorNotes, 360), location: brief.primaryLocation, mood: compact(scene.mood, 140), characterNames, characterAppearances: appearances, continuityNotes: continuityConstraints, brief };
}
