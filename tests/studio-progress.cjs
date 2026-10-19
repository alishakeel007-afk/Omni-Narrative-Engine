const assert = require('node:assert/strict');
const {loadTs} = require('../scripts/test-studio.cjs');
const {normalizeStudioState} = loadTs('types/studio.ts');
const {filmProgress} = loadTs('lib/film/progress.ts');
const {exportSignature} = loadTs('lib/film/export-state.ts');
const {sceneRequirements} = loadTs('lib/studio/identity.ts');
const {buildFilmPrompt} = loadTs('lib/film/prompt.ts');
const {scenePrompt} = loadTs('lib/studio/logic.ts');
const {sceneGeneration} = loadTs('lib/film/generate.ts');

let state = normalizeStudioState({});
assert.equal(filmProgress(state).percent,0);
for(const step of ['setup','script','generate','edit']) assert.equal(filmProgress({...state,step}).percent,0,'Opening a tab is not work');
state.premise = 'A caretaker returns a lost tape to its musician.';
const scene = {id:'s1',title:'The rehearsal',description:'A caretaker enters a rehearsal room.',visualAction:'A caretaker enters a rehearsal room.',characterIds:[],dialogues:[],takes:[]};
state.scenes=[scene];
const take={id:'t1',providerId:'p1',kind:'video',status:'complete',url:'https://example.test/clip.mp4',prompt:'x',createdAt:new Date().toISOString(),duration:5.04,sourceRequirements:sceneRequirements(state,scene)};
scene.takes=[take];
assert.equal(sceneGeneration(state,scene,0,[]).status,'review','The first completed take is selectable without paying for a second');
scene.selectedVideoId='t1';
state.clips=[{id:'clip',sceneId:'s1',sourceTakeId:'t1',sourceIn:0,sourceOut:5.04,clipVolume:1,musicVolume:0,fadeIn:0,fadeOut:0,texts:[]}];
state.exports=[{id:'export',name:'film.mp4',url:'x',createdAt:new Date().toISOString(),sourceSignature:exportSignature(state)}];
assert.equal(filmProgress(state).percent,100);
state.clips[0].sourceOut=3;
assert.ok(filmProgress(state).percent<100,'An earlier export cannot complete a changed edit');
state.scenes[0].direction={wardrobe:{c1:'yellow raincoat'},location:'The same rehearsal room'};
assert.ok(filmProgress(state).steps.find(step=>step.id==='generate').invalidated,'Saved direction invalidates the generated take');
assert.ok(filmProgress(state).steps.find(step=>step.id==='edit').invalidated,'Timeline sources are checked against live scene requirements');

state.characters=[{id:'c1',name:'Mira',appearance:'Adult, short dark curls, small eyebrow scar.',locked:true,referenceId:'r1'}];
scene.characterIds=['c1'];
const identity=state.characters[0].appearance;
const prompt=buildFilmPrompt({state,scene,language:'en',clipSeconds:5.04});
assert.match(prompt,/yellow raincoat/);
assert.match(prompt,/THIS scene only/);
assert.match(scenePrompt(state,'s1').prompt,/yellow raincoat/,'The intermediate image receives wardrobe cues as well as the video');
assert.equal(state.characters[0].appearance,identity,'A scene outfit cannot rewrite locked identity');
const other={...scene,id:'s2',direction:{}};
assert.doesNotMatch(buildFilmPrompt({state,scene:other,language:'en',clipSeconds:5.04}),/yellow raincoat/);
// Background people and expressions reach both the image and the video prompt.
scene.direction={...scene.direction,background:'Two students studying in the corner',expression:{c1:'Nervous, avoiding eye contact',ghost:'Should never appear'}};
for(const text of [buildFilmPrompt({state,scene,language:'en',clipSeconds:5.04}),scenePrompt(state,'s1').prompt]){
  assert.match(text,/Background \(silent extras only, never named characters, never speaking\): Two students studying in the corner/);
  assert.match(text,/Expressions and body language in THIS scene: Mira: Nervous, avoiding eye contact/);
  assert.doesNotMatch(text,/Should never appear/,'An expression for someone not cast is dropped');
  assert.doesNotMatch(text,/background: Two students/,'Background is not repeated as a generic cue');
}
console.log('PASS: state-based progress, stale export invalidation, first-take review, and scene-only wardrobe in real image/video prompts.');
