import { CINEMATIC_SAMPLE_CATALOG, cinematicSampleFor, type CinematicSample } from "./sample-catalog";
import { analyzePcmChannels, buildCinematicArrangement, createCinematicScoreRecipe, encodePcm16Wav, type ArrangementEvent, type CinematicScoreInput, type CinematicScoreRecipe } from "./cinematic-arrangement";

export type SampleScoreRecipe = CinematicScoreRecipe & { provider: "Sample-Based Cinematic Score v1"; genreColor: "dark" | "romantic" | "adventurous" | "neutral" };
export type SampleArrangementEvent = ArrangementEvent & { sampleId: string };

function closestSample(instrument: CinematicSample["instrument"], midi: number, category: CinematicScoreRecipe["category"]) {
  return CINEMATIC_SAMPLE_CATALOG.filter((sample) => sample.instrument === instrument && sample.moods.includes(category))
    .sort((left, right) => Math.abs(left.rootMidi - midi) - Math.abs(right.rootMidi - midi))[0];
}

export function createSampleScoreRecipe(input: CinematicScoreInput): SampleScoreRecipe {
  const base = createCinematicScoreRecipe(input);
  const joined = [input.sceneTitle, input.mood, ...(input.genres ?? [])].join(" ").toLowerCase();
  const genreColor = /horror|mystery|thriller|noir/.test(joined) ? "dark" : /romance|love/.test(joined) ? "romantic" : /fantasy|adventure|quest|science fiction|sci-fi/.test(joined) ? "adventurous" : "neutral";
  // Genre only colors an already policy-approved category; it never turns a
  // silent scene into music or replaces the policy's mood classification.
  const adjustment = genreColor === "dark" ? -4 : genreColor === "romantic" ? -5 : genreColor === "adventurous" ? 4 : 0;
  return { ...base, tempo: Math.max(50, Math.min(120, base.tempo + adjustment)), rootMidi: base.rootMidi + (genreColor === "dark" ? -2 : 0), provider: "Sample-Based Cinematic Score v1", genreColor };
}

/** Pure mapping from musical events to real recorded instruments. */
export function buildSampleArrangement(recipe: SampleScoreRecipe): SampleArrangementEvent[] {
  return buildCinematicArrangement(recipe).flatMap((event) => {
    const midi = event.midi ?? recipe.rootMidi;
    const instrument = event.kind === "pad" ? "violin" : event.kind === "bass" ? "cello" : event.kind === "melody" ? "piano" : event.kind === "shimmer" || event.kind === "tick" ? "glockenspiel" : "timpani";
    const sample = closestSample(instrument, midi, recipe.category);
    return sample ? [{ ...event, sampleId: sample.id }] : [];
  });
}

function offlineContextConstructor() { const scope = globalThis as typeof globalThis & { webkitOfflineAudioContext?: typeof OfflineAudioContext }; return scope.OfflineAudioContext ?? scope.webkitOfflineAudioContext; }
const decoded = new Map<string, AudioBuffer>();
async function loadSample(context: OfflineAudioContext, sample: CinematicSample) {
  const cached = decoded.get(sample.id); if (cached) return cached;
  const response = await fetch(sample.url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Required cinematic sample is unavailable (${sample.id}).`);
  const buffer = await context.decodeAudioData(await response.arrayBuffer());
  decoded.set(sample.id, buffer);
  return buffer;
}
function addSample(context: OfflineAudioContext, destination: AudioNode, event: SampleArrangementEvent, recipe: SampleScoreRecipe, buffer: AudioBuffer) {
  const source = context.createBufferSource(); const gain = context.createGain(); const pan = context.createStereoPanner();
  source.buffer = buffer; const sample = cinematicSampleFor(event.sampleId); const midi = event.midi ?? sample.rootMidi;
  source.playbackRate.setValueAtTime(2 ** ((midi - sample.rootMidi) / 12), event.start); pan.pan.setValueAtTime(event.pan, event.start);
  const held = event.kind === "pad";
  if (held && buffer.duration > 1) { source.loop = true; source.loopStart = Math.min(0.35, buffer.duration * 0.2); source.loopEnd = Math.max(source.loopStart + 0.1, buffer.duration - 0.12); }
  const attack = held ? Math.min(0.75, event.duration * 0.2) : event.kind === "melody" ? 0.012 : 0.006;
  const release = held ? Math.min(1.1, event.duration * 0.3) : Math.min(0.35, event.duration * 0.55);
  gain.gain.setValueAtTime(0.0001, event.start); gain.gain.linearRampToValueAtTime(event.gain, event.start + attack);
  gain.gain.setValueAtTime(event.gain * (held ? 0.8 : 0.68), Math.max(event.start + attack, event.start + event.duration - release)); gain.gain.exponentialRampToValueAtTime(0.0001, event.start + event.duration);
  source.connect(gain).connect(pan).connect(destination); source.start(event.start); source.stop(event.start + event.duration + 0.03);
}

/** Browser-only renderer. It never contacts an AI provider or server while arranging. */
export async function renderSampleBasedScore(recipe: SampleScoreRecipe): Promise<{ wav: ArrayBuffer; durationSeconds: number; analysis: ReturnType<typeof analyzePcmChannels>; eventCount: number }> {
  const OfflineContext = offlineContextConstructor(); if (!OfflineContext) throw new Error("Offline audio rendering is not supported by this browser.");
  const context = new OfflineContext(recipe.channels, Math.ceil(recipe.sampleRate * recipe.durationSeconds), recipe.sampleRate);
  const dry = context.createGain(); const delay = context.createDelay(0.55); const feedback = context.createGain(); const wet = context.createGain(); const master = context.createGain(); const compressor = context.createDynamicsCompressor();
  delay.delayTime.value = recipe.category === "action" ? 0.17 : 0.29; feedback.gain.value = recipe.category === "ambient" ? 0.17 : 0.1; wet.gain.value = recipe.category === "ambient" ? 0.13 : 0.065;
  dry.connect(master); dry.connect(delay); delay.connect(feedback).connect(delay); delay.connect(wet).connect(master); compressor.threshold.value = -15; compressor.knee.value = 12; compressor.ratio.value = 2.5; compressor.attack.value = 0.012; compressor.release.value = 0.25;
  master.gain.setValueAtTime(0.0001, 0); master.gain.linearRampToValueAtTime(0.52, 0.9); master.gain.setValueAtTime(0.52, recipe.durationSeconds - 1.35); master.gain.exponentialRampToValueAtTime(0.0001, recipe.durationSeconds); master.connect(compressor).connect(context.destination);
  const arrangement = buildSampleArrangement(recipe); const buffers = await Promise.all([...new Set(arrangement.map((event) => event.sampleId))].map(async (id) => [id, await loadSample(context, cinematicSampleFor(id))] as const)); const lookup = new Map(buffers);
  arrangement.forEach((event) => addSample(context, dry, event, recipe, lookup.get(event.sampleId)!));
  const rendered = await context.startRendering(); const channels = Array.from({ length: rendered.numberOfChannels }, (_, index) => rendered.getChannelData(index));
  return { wav: encodePcm16Wav(channels, rendered.sampleRate), durationSeconds: rendered.duration, analysis: analyzePcmChannels(channels, rendered.sampleRate), eventCount: arrangement.length };
}
