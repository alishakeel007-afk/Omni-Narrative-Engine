import type { MusicCategory } from "./music-policy";

export type CinematicSample = {
  id: string;
  url: string;
  sourceUrl: string;
  creator: string;
  source: string;
  license: "CC0-1.0";
  attribution: string;
  acquisitionDate: string;
  sha256: string;
  bytes: number;
  instrument: "piano" | "cello" | "violin" | "glockenspiel" | "timpani";
  rootMidi: number;
  moods: readonly MusicCategory[];
};

const BASE = "/media/cinematic-samples/vsco-ce-v1/";
const REPOSITORY = "https://github.com/sgossner/VSCO-2-CE";
const RAW = "https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/";

/**
 * A deliberately small, redistributable CC0 subset. Checksums make any
 * accidental replacement visible in review and in the focused asset test.
 */
export const CINEMATIC_SAMPLE_CATALOG: readonly CinematicSample[] = [
  { id: "piano-49", url: `${BASE}piano-a2.wav`, sourceUrl: `${RAW}Keys/Upright%20Piano/Player_dyn1_rr1_014.wav`, creator: "Simon Dalzell (Ivy Audio)", source: "VSCO Community Edition", license: "CC0-1.0", attribution: "Upright Piano sampled by Simon Dalzell / VSCO Community Edition", acquisitionDate: "2026-10-16", sha256: "f3d00b63bb178680fdd4d9ed7ea43d1df1cf29e00b567ccb022c2bd411a20607", bytes: 2270980, instrument: "piano", rootMidi: 49, moods: ["ambient", "emotional", "hopeful", "suspense"] },
  { id: "piano-69", url: `${BASE}piano-c4.wav`, sourceUrl: `${RAW}Keys/Upright%20Piano/Player_dyn1_rr1_024.wav`, creator: "Simon Dalzell (Ivy Audio)", source: "VSCO Community Edition", license: "CC0-1.0", attribution: "Upright Piano sampled by Simon Dalzell / VSCO Community Edition", acquisitionDate: "2026-10-16", sha256: "916c3ec2d61fb421e74fb4866ef75d3ef17e9d88e9dc858da24159846489d33f", bytes: 2222998, instrument: "piano", rootMidi: 69, moods: ["ambient", "emotional", "hopeful"] },
  { id: "piano-81", url: `${BASE}piano-a4.wav`, sourceUrl: `${RAW}Keys/Upright%20Piano/Player_dyn1_rr1_030.wav`, creator: "Simon Dalzell (Ivy Audio)", source: "VSCO Community Edition", license: "CC0-1.0", attribution: "Upright Piano sampled by Simon Dalzell / VSCO Community Edition", acquisitionDate: "2026-10-16", sha256: "d3d47e12108098d25a490fbac30cbbf29dfac801bbebd62b969cc1fe7a8342e5", bytes: 3120676, instrument: "piano", rootMidi: 81, moods: ["hopeful", "ambient"] },
  { id: "cello-35", url: `${BASE}cello-b1-sustain.wav`, sourceUrl: `${RAW}Strings/Cello%20Section/susvib/susvib_B1_v1_1.wav`, creator: "VSCO Community Edition contributors", source: "VSCO Community Edition", license: "CC0-1.0", attribution: "Cello Section / VSCO Community Edition", acquisitionDate: "2026-10-16", sha256: "4f95c087c4b8d87ee591e9d39c3c9caf085c6f1b9125eac3ca9e4e637da628ee", bytes: 2372492, instrument: "cello", rootMidi: 35, moods: ["ambient", "suspense", "emotional", "action"] },
  { id: "cello-48", url: `${BASE}cello-c3-sustain.wav`, sourceUrl: `${RAW}Strings/Cello%20Section/susvib/susvib_C3_v1_1.wav`, creator: "VSCO Community Edition contributors", source: "VSCO Community Edition", license: "CC0-1.0", attribution: "Cello Section / VSCO Community Edition", acquisitionDate: "2026-10-16", sha256: "a614ee7ca821b44660236e47b89620cf914ec6ad27a99bc0d9764f47dbe512e1", bytes: 2444174, instrument: "cello", rootMidi: 48, moods: ["ambient", "suspense", "emotional", "action"] },
  { id: "violin-50", url: `${BASE}violin-d3-sustain.wav`, sourceUrl: `${RAW}Strings/Violin%20Section/susVib/VlnEns_susVib_D3_v1.wav`, creator: "VSCO Community Edition contributors", source: "VSCO Community Edition", license: "CC0-1.0", attribution: "Violin Section / VSCO Community Edition", acquisitionDate: "2026-10-16", sha256: "583e660bc5daa4e094aef5fc014fbb92751040be8741ed7a16847306a1fe0a99", bytes: 2061808, instrument: "violin", rootMidi: 50, moods: ["ambient", "suspense", "emotional", "action", "hopeful"] },
  { id: "violin-57", url: `${BASE}violin-a3-sustain.wav`, sourceUrl: `${RAW}Strings/Violin%20Section/susVib/VlnEns_susVib_A3_v1.wav`, creator: "VSCO Community Edition contributors", source: "VSCO Community Edition", license: "CC0-1.0", attribution: "Violin Section / VSCO Community Edition", acquisitionDate: "2026-10-16", sha256: "72817a53dfd2eb61eca94658c14e1cab6017629ca2f27bab8e394c6675bfaad7", bytes: 1890316, instrument: "violin", rootMidi: 57, moods: ["ambient", "suspense", "emotional", "action", "hopeful"] },
  { id: "glock-67", url: `${BASE}glock-g4.wav`, sourceUrl: `${RAW}Percussion/Glock/glock_medium_G4.wav`, creator: "VSCO Community Edition contributors", source: "VSCO Community Edition", license: "CC0-1.0", attribution: "Glockenspiel / VSCO Community Edition", acquisitionDate: "2026-10-16", sha256: "6c4649b13e24fa01e4634edad8fe8edf18aef33facc5d49fe53097b376bac4da", bytes: 1271310, instrument: "glockenspiel", rootMidi: 67, moods: ["ambient", "hopeful", "emotional"] },
  { id: "glock-84", url: `${BASE}glock-c6.wav`, sourceUrl: `${RAW}Percussion/Glock/glock_medium_C6.wav`, creator: "VSCO Community Edition contributors", source: "VSCO Community Edition", license: "CC0-1.0", attribution: "Glockenspiel / VSCO Community Edition", acquisitionDate: "2026-10-16", sha256: "e942cbf502cf6731df2925945fe3234c876cb63f047d91007b6929887f9e4904", bytes: 1271310, instrument: "glockenspiel", rootMidi: 84, moods: ["ambient", "hopeful"] },
  { id: "timpani-low", url: `${BASE}timpani-hit-1.wav`, sourceUrl: `${RAW}Percussion/Timpani/Timpani1_Hit_v1_rr1_Sum.wav`, creator: "VSCO Community Edition contributors", source: "VSCO Community Edition", license: "CC0-1.0", attribution: "Timpani / VSCO Community Edition", acquisitionDate: "2026-10-16", sha256: "a43d60795e9eab808866c22b6b6b42a64d3a13f6754838f0100a0a1e9a3029cd", bytes: 559976, instrument: "timpani", rootMidi: 36, moods: ["action", "suspense"] },
  { id: "timpani-mid", url: `${BASE}timpani-hit-3.wav`, sourceUrl: `${RAW}Percussion/Timpani/Timpani3_Hit_v1_rr1_Sum.wav`, creator: "VSCO Community Edition contributors", source: "VSCO Community Edition", license: "CC0-1.0", attribution: "Timpani / VSCO Community Edition", acquisitionDate: "2026-10-16", sha256: "00319863ade67b49ec64566eecc801ac7c95e101860b7bb3263f25c7d6757392", bytes: 929172, instrument: "timpani", rootMidi: 43, moods: ["action", "suspense"] },
] as const;

export const SAMPLE_CREDITS = {
  source: "VSCO Community Edition",
  sourceUrl: REPOSITORY,
  license: "CC0-1.0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  attribution: "Attribution is encouraged by the source, although CC0 does not require it.",
} as const;

export function cinematicSampleFor(id: string) {
  const sample = CINEMATIC_SAMPLE_CATALOG.find((entry) => entry.id === id);
  if (!sample) throw new Error(`Unknown cinematic sample: ${id}`);
  return sample;
}
