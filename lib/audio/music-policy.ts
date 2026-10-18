// ============================================================
// Scene-aware background music policy.
// This module is deliberately pure: it makes no network, storage, or database
// calls, so music remains optional and easy to test.
// ============================================================

export type MusicCategory = "ambient" | "suspense" | "emotional" | "action" | "hopeful";

export type PreviousSceneMusic = {
  category?: MusicCategory;
  trackId?: string;
  wasSilent?: boolean;
};

export type SceneMusicInput = {
  mood?: string;
  sceneTitle?: string;
  sceneTone?: string;
  soundDesign?: string;
  narration?: string;
  dialogueCount?: number;
  estimatedDuration?: string;
  previous?: PreviousSceneMusic;
};

export type SceneMusicDecision =
  | { outcome: "silence"; reason: string }
  | { outcome: "music"; category: MusicCategory; reason: string; reusePreviousTrack: boolean };

const ACTION_CUES = /\b(action|battle|fight|chase|escape|attack|urgent|explosion|race|climax|danger)\b/i;
const SUSPENSE_CUES = /\b(suspense(?:ful)?|mystery|mysterious|tense|tension|threat|secret|glitch|horror|dread|uneasy)\b/i;
const EMOTIONAL_CUES = /\b(sad|grief|mourn|loss|heartbreak|vulnerable|farewell|reconciliation|regret)\b/i;
const HOPEFUL_CUES = /\b(hopeful|uplifting|triumph|victory|resolve|reunion|celebrat|dawn|breakthrough)\b/i;
const AMBIENT_CUES = /\b(wonder|discovery|awe|dream|atmospheric|quiet|serene|peaceful|explor)\b/i;
const TRANSITION_CUES = /\b(transition|meanwhile|later|arrival|departure|exposition|recap|interlude)\b/i;

function sceneText(input: SceneMusicInput): string {
  return [input.mood, input.sceneTitle, input.sceneTone, input.soundDesign, input.narration]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ");
}

/**
 * Chooses score only when it provides narrative value. Dialogue-heavy neutral
 * scenes intentionally remain silent so narration and character performances
 * retain space.
 */
export function decideSceneMusic(input: SceneMusicInput): SceneMusicDecision {
  const text = sceneText(input);
  const dialogueHeavy = (input.dialogueCount ?? 0) >= 3;
  const reuse = (category: MusicCategory) =>
    input.previous?.category === category && Boolean(input.previous.trackId);

  if (ACTION_CUES.test(text)) {
    return { outcome: "music", category: "action", reason: "High-stakes action benefits from a restrained instrumental pulse.", reusePreviousTrack: reuse("action") };
  }
  if (SUSPENSE_CUES.test(text)) {
    return { outcome: "music", category: "suspense", reason: "Tension or mystery warrants a low, unobtrusive suspense bed.", reusePreviousTrack: reuse("suspense") };
  }
  if (EMOTIONAL_CUES.test(text)) {
    return { outcome: "music", category: "emotional", reason: "The scene carries an emotional beat that benefits from a gentle instrumental underscore.", reusePreviousTrack: reuse("emotional") };
  }
  if (HOPEFUL_CUES.test(text)) {
    return { outcome: "music", category: "hopeful", reason: "The scene has a hopeful or resolving beat suited to a light instrumental cue.", reusePreviousTrack: reuse("hopeful") };
  }
  if (TRANSITION_CUES.test(text) || dialogueHeavy) {
    return { outcome: "silence", reason: dialogueHeavy ? "Intentional silence keeps this dialogue-heavy scene clear." : "Intentional silence preserves pacing for a transition or exposition beat." };
  }
  if (AMBIENT_CUES.test(text)) {
    return { outcome: "music", category: "ambient", reason: "The setting benefits from a quiet atmospheric instrumental bed.", reusePreviousTrack: reuse("ambient") };
  }

  return { outcome: "silence", reason: "Intentional silence keeps this neutral scene focused on story and narration." };
}
