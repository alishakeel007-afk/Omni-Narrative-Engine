// @ts-expect-error Node's native TypeScript runner requires source extensions.
import { buildNarrativeContract, buildNarrativeContractPrompt, narrativeMilestones, validateNarrativeConsistency } from "../lib/narrative-consistency.ts";

function scene(sceneNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    sceneNumber,
    title: `Scene ${sceneNumber}`,
    location: sceneNumber === 1 ? "The shadow archive" : "The city gates",
    mood: "Tense",
    narration: "Mira protects the last shadow while the city learns the cost of losing its memory.",
    directorNotes: "The choice leaves a visible consequence for the next scene.",
    sceneGenre: "Fantasy",
    sceneTone: "Suspenseful",
    estimatedDuration: "45 seconds",
    imagePrompt: "Indoor archive, Mira and the last shadow.",
    visualPrompt: "Cinematic archive scene.",
    soundDesign: "Quiet wind and distant bells.",
    dialogues: [{
      id: `line-${sceneNumber}`,
      character: "Mira",
      delivery: "quietly determined",
      line: "I will not let the city forget what this shadow protects.",
      voiceProfile: { archetype: "hero_female", character: "Mira", deepgramModel: "aura-2-thalia-en", description: "", gender: "feminine", tone: "determined", voiceName: "Thalia" }
    }],
    ...overrides
  };
}

const keeperIdea = "The Last Keeper of Shadows follows Mira, who must protect the last living shadow in an underground archive before the city erases its memories. Her former friend Iven believes the sacrifice will save everyone, but the city can only be restored if Mira chooses what truth survives. End with an open, hopeful consequence.";
const keeperContract = buildNarrativeContract(keeperIdea);
const keeperPrompt = buildNarrativeContractPrompt(keeperContract, 3);

for (const expected of ["The Last Keeper of Shadows", "former friend Iven", "only be restored", "open, hopeful consequence", "Scene 2: escalation + revelation"]) {
  if (!keeperPrompt.includes(expected)) throw new Error(`Narrative contract omitted: ${expected}`);
}

const shortPlan = narrativeMilestones(3).map((entry) => entry.join("+")).join("|");
if (shortPlan !== "opening|escalation+revelation|climax+resolution") throw new Error("Three-scene milestone distribution regressed.");
const longPlan = narrativeMilestones(6);
if (!longPlan.at(-1)?.includes("resolution") || !longPlan.some((entry) => entry.includes("revelation"))) throw new Error("Long-story milestone distribution regressed.");

const consistentReport = validateNarrativeConsistency({
  contract: keeperContract,
  expectedSceneCount: 3,
  scenes: [
    scene(1, { title: "Keeper of the Archive", location: "Underground shadow archive" }),
    scene(2, { title: "Iven's Impossible Choice", location: "The archive bridge" }),
    scene(3, { title: "A Hopeful Uncertainty", location: "City gates", narration: "Mira lets one chosen truth survive; the city remembers enough to change, while the last shadow opens a path into an uncertain future.", directorNotes: "Hold on the unresolved but hopeful consequence." })
  ]
});
if (!consistentReport.usable || consistentReport.issues.length) throw new Error(`A coherent open ending was rejected: ${consistentReport.issues.join("; ")}`);

const mystery = buildNarrativeContract("Detective Noor searches a locked observatory for her missing mentor. The murderer may be the witness, and the final clue should reveal why the telescope cannot point at the moon.");
if (!mystery.centralConflict.length || !mystery.revelations.length) throw new Error("Mystery facts were not retained.");

const scienceFiction = buildNarrativeContract("On Aster Station, Captain Ren can only use the jump gate once because each jump erases a year of memory. Ren must rescue the crew without breaking that rule.");
if (!scienceFiction.worldRules.some((entry) => entry.includes("only use the jump gate once"))) throw new Error("Explicit science-fiction rule was lost.");

const romance = buildNarrativeContract("After years apart, Sana and Leif investigate a flooded theatre. Their relationship changes only after Leif admits why he left.");
if (!romance.relationships.length || !romance.revelations.length) throw new Error("Relationship-change precondition was lost.");

const flawedReport = validateNarrativeConsistency({
  contract: keeperContract,
  expectedSceneCount: 3,
  scenes: [scene(1), scene(2), scene(3, { title: "Another Night", narration: "Mira walks through the city.", directorNotes: "Fade out." })]
});
if (!flawedReport.shouldRepair || !flawedReport.issues.some((issue) => issue.includes("final scene"))) throw new Error("Missing ending consequence was not detected.");

const unresolvedDecisionReport = validateNarrativeConsistency({
  contract: keeperContract,
  expectedSceneCount: 3,
  scenes: [
    scene(1, { title: "The Warning", narration: "Mira learns that saving the city will demand a sacrifice." }),
    scene(2, { title: "The Price", narration: "Iven explains what the sacrifice would cost them both." }),
    scene(3, { title: "The Last Choice", narration: "Mira must choose whether to sacrifice the last shadow.", directorNotes: "Hold on the impossible decision." })
  ]
});
if (!unresolvedDecisionReport.issues.some((issue) => issue.includes("central decision"))) throw new Error("A pending climax was not detected.");

const rushedSacrificeReport = validateNarrativeConsistency({
  contract: buildNarrativeContract("A guardian must save a kingdom, even if the sacrifice costs her family."),
  expectedSceneCount: 3,
  scenes: [
    scene(1, { title: "The Gate Opens", narration: "The guardian enters the kingdom." }),
    scene(2, { title: "The Battle", narration: "The guardian fights through the gates." }),
    scene(3, { title: "The Price", narration: "The guardian sacrifices her family to save the kingdom.", directorNotes: "Show the grief after the sacrifice." })
  ]
});
if (!rushedSacrificeReport.issues.some((issue) => issue.includes("sacrifice appears only"))) throw new Error("An abrupt sacrifice was not detected.");

const contradictoryDecisionReport = validateNarrativeConsistency({
  contract: keeperContract,
  scenes: [scene(1, {
    narration: "Mira sacrifices the last shadow without explaining why she reversed herself.",
    dialogues: [{ ...scene(1).dialogues[0], line: "I will not sacrifice the last shadow." }]
  })]
});
if (!contradictoryDecisionReport.issues.some((issue) => issue.includes("refuses an action"))) throw new Error("A direct dialogue/action contradiction was not detected.");

const unnaturalDialogueReport = validateNarrativeConsistency({
  contract: keeperContract,
  scenes: [scene(1, { dialogues: [{ ...scene(1).dialogues[0], line: "I forgive me for what happened." }] })]
});
if (!unnaturalDialogueReport.issues.some((issue) => issue.includes("unnatural self-directed"))) throw new Error("Malformed dialogue was not detected.");

const intentionalOpenReport = validateNarrativeConsistency({
  contract: keeperContract,
  expectedSceneCount: 3,
  scenes: [
    scene(1, { title: "The Warning", narration: "Mira learns that the city will pay a cost." }),
    scene(2, { title: "The Truth", narration: "Iven reveals why the shadow matters." }),
    scene(3, { title: "An Uncertain Future", narration: "Mira cannot decide whether to sacrifice the shadow, but the city has changed and its uncertain future now rests with her.", directorNotes: "Make the unresolved consequence deliberate." })
  ]
});
if (intentionalOpenReport.issues.some((issue) => issue.includes("central decision"))) throw new Error("A valid intentional open ending was rejected.");

const fallbackSafe = validateNarrativeConsistency({ contract: buildNarrativeContract("A traveler crosses a desert."), scenes: [scene(1)] });
if (!fallbackSafe.usable) throw new Error("A usable first-pass script would not survive a failed repair attempt.");

console.log("Step 23 narrative consistency tests passed.");
