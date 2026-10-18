import type { MovieScene } from "@/types/video";

export type NarrativeMilestone = "opening" | "escalation" | "revelation" | "climax" | "resolution";

export type NarrativeContract = {
  sourceIdea: string;
  explicitRequirements: string[];
  centralConflict: string[];
  characterGoals: string[];
  relationships: string[];
  locationsAndMilestones: string[];
  revelations: string[];
  worldRules: string[];
  sacrificesAndConsequences: string[];
  unresolvedThreads: string[];
  resolutionConditions: string[];
};

export type NarrativeConsistencyReport = {
  issues: string[];
  usable: boolean;
  shouldRepair: boolean;
};

const CLAUSE_LIMIT = 180;

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sentences(value: string) {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map(clean)
    .filter(Boolean)
    .slice(0, 12);
}

function matchingClauses(source: string[], expression: RegExp) {
  return source
    .filter((clause) => expression.test(clause))
    .map((clause) => clause.slice(0, CLAUSE_LIMIT));
}

/**
 * Creates a lightweight, evidence-only contract from the user's idea. This is
 * deliberately not an LLM extraction step: every entry is a clause copied
 * from the supplied idea, so the generator cannot mistake invented detail for
 * a user requirement.
 */
export function buildNarrativeContract(idea: string): NarrativeContract {
  const sourceIdea = clean(idea);
  const clauses = sentences(sourceIdea);
  const all = clauses.length ? clauses : [sourceIdea].filter(Boolean);
  const find = (pattern: RegExp) => matchingClauses(all, pattern);

  return {
    sourceIdea,
    explicitRequirements: all,
    centralConflict: find(/\b(conflict|against|versus|must stop|threat|danger|save|survive|prevent|fight|murder|missing|stolen|curse|secret)\b/i),
    characterGoals: find(/\b(wants?|needs?|must|tries?|seeks?|searches?|hopes?|goal|find|rescue|escape|protect)\b/i),
    relationships: find(/\b(friend|lover|romance|relationship|sister|brother|mother|father|partner|ally|enemy|rival|trust|betray)\b/i),
    locationsAndMilestones: find(/\b(in|at|inside|beneath|aboard|city|station|workshop|castle|forest|rooftop|village|world|kingdom|planet|gate|tower)\b/i),
    revelations: find(/\b(reveal|reveals|secret|truth|discover|discovers|identity|actually|turns out|hidden|admit|admits|confess|confesses)\b/i),
    worldRules: find(/\b(rule|cannot|can only|only if|magic|technology|cost|price|forbidden|without)\b/i),
    sacrificesAndConsequences: find(/\b(sacrifice|cost|consequence|lose|loss|risk|price|choice|unless|otherwise)\b/i),
    unresolvedThreads: find(/\b(mystery|unknown|unanswered|unresolved|open ending|uncertain|perhaps)\b/i),
    resolutionConditions: find(/\b(end|ending|resolve|resolution|finally|returns?|reconcile|escape|defeat|survive|open ending|ambiguous)\b/i)
  };
}

export function narrativeMilestones(sceneCount: number): NarrativeMilestone[][] {
  const total = Math.max(1, Math.round(sceneCount));
  if (total === 1) return [["opening", "escalation", "climax", "resolution"]];
  if (total === 2) return [["opening", "escalation"], ["climax", "resolution"]];
  if (total === 3) return [["opening"], ["escalation", "revelation"], ["climax", "resolution"]];
  if (total === 4) return [["opening"], ["escalation"], ["revelation", "climax"], ["resolution"]];

  return Array.from({ length: total }, (_, index) => {
    if (index === 0) return ["opening"];
    if (index === total - 1) return ["resolution"];
    if (index === total - 2) return ["climax"];
    if (index === Math.floor(total / 2)) return ["revelation"];
    return ["escalation"];
  });
}

function listed(label: string, entries: string[]) {
  return entries.length ? `- ${label}: ${entries.join(" | ")}` : `- ${label}: not specified; do not invent it as a fixed fact.`;
}

export function buildNarrativeContractPrompt(contract: NarrativeContract, sceneCount: number) {
  const milestones = narrativeMilestones(sceneCount)
    .map((scene, index) => `Scene ${index + 1}: ${scene.join(" + ")}`)
    .join("; ");

  return [
    "NARRATIVE CONTRACT — preserve these user-supplied facts. Treat other details as optional creative choices, not fixed facts.",
    listed("Explicit user requirements", contract.explicitRequirements),
    listed("Central conflict", contract.centralConflict),
    listed("Character goals", contract.characterGoals),
    listed("Relationships", contract.relationships),
    listed("Locations or milestones", contract.locationsAndMilestones),
    listed("Revelations", contract.revelations),
    listed("World rules", contract.worldRules),
    listed("Sacrifices or consequences", contract.sacrificesAndConsequences),
    listed("Unresolved threads", contract.unresolvedThreads),
    listed("Resolution conditions", contract.resolutionConditions),
    `Required narrative progression: ${milestones}.`,
    "An ending may be happy, tragic, bittersweet, hopeful, ambiguous, or open. It must still show the consequence of the central conflict and make any intentional unresolved thread legible."
  ].join("\n");
}

function words(value: string) {
  return new Set(value.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []);
}

function hasMeaningfulOverlap(requirements: string[], story: string) {
  if (!requirements.length) return true;
  const storyWords = words(story);
  return requirements.some((requirement) => {
    const requirementWords = [...words(requirement)].filter((word) => !new Set(["that", "with", "from", "this", "their", "they", "into", "about", "while"]).has(word));
    return requirementWords.some((word) => storyWords.has(word));
  });
}

const SACRIFICE_PATTERN = /\b(sacrific(?:e|es|ed|ing)|give(?:s|n)? up|gave up|leave(?:s|ing)? behind|left behind|the price|at the cost|los(?:e|es|t|ing))\b/i;
const DECISION_PENDING_PATTERN = /\b(must choose|has to choose|needs to choose|whether to|cannot decide|can(?:not|'t) decide|the choice is hers|the choice is his|the choice is theirs)\b/i;
const DECISION_OUTCOME_PATTERN = /\b(chose|chooses|decided|lets?|gave|gives|saved|lost|restored|destroyed|escaped|survived|died|remained|changed|accepted|rejected)\b/i;
const INTENTIONAL_OPEN_PATTERN = /\b(open(?: ending)?|uncertain|unknown|unanswered|unresolved|ambiguous|perhaps|remains?)\b/i;
const OPEN_CONSEQUENCE_PATTERN = /\b(cost|aftermath|future|changed|remains?|new path|what comes next|will carry|now knows)\b/i;

function hasCentralDecision(contract: NarrativeContract) {
  return contract.sacrificesAndConsequences.length > 0 || contract.explicitRequirements.some((entry) => /\b(choose|decision|sacrifice|give up|cost|price)\b/i.test(entry));
}

function findDialogueIssue(scene: MovieScene) {
  for (const line of scene.dialogues) {
    const text = line.line.trim();
    // These direct reflexive constructions are malformed in ordinary English
    // and are safe to ask a repair pass to rewrite without changing story intent.
    if (/\b(?:i|we|you|he|she|they)\s+(?:forgive|forgave|blame|betray|hate)\s+(?:me|us|you|him|her|them)\b/i.test(text)) {
      const [subject, verb, object] = text.match(/\b(i|we|you|he|she|they)\s+(forgive|forgave|blame|betray|hate)\s+(me|us|you|him|her|them)\b/i)?.slice(1) ?? [];
      const reflexive = new Map([["i", "me"], ["we", "us"], ["you", "you"], ["he", "him"], ["she", "her"], ["they", "them"]]);
      if (subject && object && reflexive.get(subject.toLowerCase()) === object.toLowerCase()) {
        return `Dialogue for ${line.character} contains an unnatural self-directed statement.`;
      }
      void verb;
    }

    const refusal = text.match(/\bI\s+(?:will not|won't|cannot|can't|refuse to)\s+(sacrifice|leave|abandon|destroy|betray|kill)\b/i);
    if (refusal) {
      const action = refusal[1].toLowerCase();
      const narration = `${scene.narration} ${scene.directorNotes}`.toLowerCase();
      const actor = line.character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${actor}\\b[^.]{0,160}\\b${action}`, "i").test(narration)) {
        return `${line.character}'s dialogue refuses an action that the same scene says they perform without explaining the reversal.`;
      }
    }
  }
  return null;
}

/** Deterministic guardrails for malformed or clearly disconnected scripts. */
export function validateNarrativeConsistency(params: {
  contract: NarrativeContract;
  expectedSceneCount?: number;
  scenes: MovieScene[];
}): NarrativeConsistencyReport {
  const issues: string[] = [];
  const { scenes, contract } = params;
  const allText = scenes.map((scene) => `${scene.title} ${scene.location} ${scene.narration} ${scene.dialogues.map((line) => line.line).join(" ")}`).join(" ");

  if (!scenes.length) issues.push("The script has no scenes.");
  if (params.expectedSceneCount && scenes.length !== params.expectedSceneCount) issues.push("The script does not contain the requested number of scenes.");
  if (scenes.some((scene, index) => scene.sceneNumber !== index + 1)) issues.push("Scene numbers are not sequential.");
  if (scenes.some((scene) => !clean(scene.location) || !clean(scene.narration))) issues.push("Every scene needs a location and narrative content.");
  if (new Set(scenes.map((scene) => scene.title.toLowerCase())).size !== scenes.length) issues.push("Scene titles are duplicated, which makes progression unclear.");
  if (!hasMeaningfulOverlap(contract.explicitRequirements, allText)) issues.push("The generated script does not visibly preserve the supplied story idea.");

  const finalScene = scenes.at(-1);
  if (finalScene && scenes.length > 1) {
    const endingText = `${finalScene.title} ${finalScene.narration} ${finalScene.directorNotes}`.toLowerCase();
    const endingSignals = /\b(resolv|consequence|cost|aftermath|future|remain|opens?|changes?|decides?|returns?|escape|defeat|survive|together|apart|hope|uncertain)\b/;
    if (!endingSignals.test(endingText)) issues.push("The final scene does not make an outcome or an intentional open consequence clear.");
    if (hasCentralDecision(contract) && DECISION_PENDING_PATTERN.test(endingText) && !DECISION_OUTCOME_PATTERN.test(endingText)) {
      const intentionalOpen = INTENTIONAL_OPEN_PATTERN.test(endingText) && OPEN_CONSEQUENCE_PATTERN.test(endingText);
      if (!intentionalOpen) issues.push("The final scene presents a central decision but does not show its outcome or a clearly intentional open consequence.");
    }
  }

  if (scenes.length >= 3 && SACRIFICE_PATTERN.test(`${finalScene?.narration ?? ""} ${finalScene?.directorNotes ?? ""}`)) {
    const earlierText = scenes.slice(0, -1).map((scene) => `${scene.narration} ${scene.directorNotes} ${scene.dialogues.map((line) => line.line).join(" ")}`).join(" ");
    if (!SACRIFICE_PATTERN.test(earlierText)) issues.push("A major sacrifice appears only in the final scene without earlier setup.");
  }

  for (const scene of scenes) {
    const dialogueIssue = findDialogueIssue(scene);
    if (dialogueIssue) {
      issues.push(dialogueIssue);
      break;
    }
  }

  const fatal = issues.some((issue) => /no scenes|requested number|sequential|location and narrative/.test(issue));
  return { issues, usable: !fatal, shouldRepair: issues.length > 0 && scenes.length > 0 };
}
