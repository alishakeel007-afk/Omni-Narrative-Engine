/** Server-side validation for browser-generated cinematic-score WAV files. */

export const MAX_IMPORTED_MUSIC_BYTES = 25 * 1024 * 1024;
export const MAX_IMPORTED_MUSIC_DURATION_SECONDS = 90;
export const MIN_IMPORTED_MUSIC_DURATION_SECONDS = 0.25;

export class WavValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WavValidationError";
  }
}

export type ValidatedWav = {
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  audioFormat: number;
  dataBytes: number;
};

function fourCC(view: DataView, offset: number) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * Validates a RIFF/WAVE container and derives its duration from its PCM/float
 * format chunk. This intentionally does not trust the uploaded filename/MIME.
 */
export function validateImportedWav(bytes: ArrayBuffer | Uint8Array): ValidatedWav {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.byteLength > MAX_IMPORTED_MUSIC_BYTES) {
    throw new WavValidationError("Music files must be 25 MB or smaller.");
  }
  if (data.byteLength < 44) {
    throw new WavValidationError("The uploaded file is not a complete WAV file.");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (fourCC(view, 0) !== "RIFF" || fourCC(view, 8) !== "WAVE") {
    throw new WavValidationError("Only RIFF/WAVE audio files can be imported.");
  }

  const riffSize = view.getUint32(4, true);
  if (riffSize + 8 > data.byteLength) {
    throw new WavValidationError("The WAV file is truncated.");
  }

  let offset = 12;
  let format: Omit<ValidatedWav, "durationSeconds" | "dataBytes"> | undefined;
  let dataBytes: number | undefined;

  while (offset + 8 <= data.byteLength) {
    const chunkId = fourCC(view, offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > data.byteLength) {
      throw new WavValidationError("The WAV file contains a truncated data chunk.");
    }

    if (chunkId === "fmt ") {
      if (chunkSize < 16) throw new WavValidationError("The WAV format chunk is invalid.");
      const audioFormat = view.getUint16(chunkStart, true);
      const channels = view.getUint16(chunkStart + 2, true);
      const sampleRate = view.getUint32(chunkStart + 4, true);
      const byteRate = view.getUint32(chunkStart + 8, true);
      const blockAlign = view.getUint16(chunkStart + 12, true);
      const bitsPerSample = view.getUint16(chunkStart + 14, true);

      if ((audioFormat !== 1 && audioFormat !== 3) || channels < 1 || channels > 2) {
        throw new WavValidationError("Only mono or stereo PCM/IEEE-float WAV files are supported.");
      }
      if (sampleRate < 8_000 || sampleRate > 192_000 || byteRate === 0 || blockAlign === 0) {
        throw new WavValidationError("The WAV sample rate or byte rate is invalid.");
      }
      if ((audioFormat === 1 && ![8, 16, 24, 32].includes(bitsPerSample)) || (audioFormat === 3 && bitsPerSample !== 32)) {
        throw new WavValidationError("The WAV bit depth is not supported.");
      }
      if (byteRate !== sampleRate * blockAlign) {
        throw new WavValidationError("The WAV byte rate is inconsistent with its format.");
      }
      format = { audioFormat, channels, sampleRate, bitsPerSample };
    } else if (chunkId === "data" && dataBytes === undefined) {
      dataBytes = chunkSize;
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!format || dataBytes === undefined || dataBytes === 0) {
    throw new WavValidationError("The WAV file must include valid format and audio data chunks.");
  }

  const bytesPerSample = format.bitsPerSample / 8;
  const byteRate = format.sampleRate * format.channels * bytesPerSample;
  const durationSeconds = dataBytes / byteRate;
  if (!Number.isFinite(durationSeconds) || durationSeconds < MIN_IMPORTED_MUSIC_DURATION_SECONDS) {
    throw new WavValidationError("The WAV file is too short to use as background music.");
  }
  if (durationSeconds > MAX_IMPORTED_MUSIC_DURATION_SECONDS) {
    throw new WavValidationError("Music must be 90 seconds or shorter.");
  }

  return { ...format, dataBytes, durationSeconds };
}
