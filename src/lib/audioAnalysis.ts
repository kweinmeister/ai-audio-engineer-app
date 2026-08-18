import type { AudioFeatures } from "../types";

/**
 * Minimal shape of an AudioBuffer required by the analyzer.
 *
 * Depending on the structural subset instead of the full `AudioBuffer`
 * interface keeps the analysis testable without a Web Audio implementation.
 */
export type AnalyzableAudioBuffer = Pick<AudioBuffer, "duration" | "sampleRate" | "getChannelData">;

/** Amplitude at or above which a sample counts as clipped. */
export const CLIPPING_AMPLITUDE_THRESHOLD = 0.98;

/** Number of clipped samples tolerated before clipping is reported. */
export const CLIPPING_SAMPLE_TOLERANCE = 10;

/** Level reported for digital silence, in dBFS. */
export const SILENCE_DB = -120;

/** Level reported when no quiet segment can be measured, in dBFS. */
export const DEFAULT_NOISE_FLOOR_DB = -90;

/** Frequency bands reported when the estimate yields nothing usable, in Hz. */
export const FALLBACK_FREQUENCY_PEAKS = [120, 1000, 4500, 8000];

/**
 * Derive acoustic measurements from a decoded audio buffer.
 *
 * Measure peak and RMS levels, detect digital clipping, estimate the noise
 * floor from the quietest 100 ms segment, and approximate prominent frequency
 * bands from the zero-crossing rate. Only the first channel is inspected.
 */
export function analyzeAudioBuffer(
  buffer: AnalyzableAudioBuffer,
  fileName: string,
  fileSize: number,
  mimeType: string,
): AudioFeatures {
  const duration = buffer.duration;
  const sampleRate = buffer.sampleRate;
  const leftChannelData = buffer.getChannelData(0);

  // Calculate peaks, RMS average, and clipping counts
  let peakValue = 0;
  let sumOfSquares = 0;
  let clippingSamplesCount = 0;

  for (let i = 0; i < leftChannelData.length; i++) {
    const val = leftChannelData[i];
    const absVal = Math.abs(val);

    if (absVal > peakValue) {
      peakValue = absVal;
    }

    sumOfSquares += val * val;

    if (absVal >= CLIPPING_AMPLITUDE_THRESHOLD) {
      clippingSamplesCount++;
    }
  }

  const rms = leftChannelData.length > 0 ? Math.sqrt(sumOfSquares / leftChannelData.length) : 0;
  const maxVolumeDb = peakValue > 0 ? 20 * Math.log10(peakValue) : SILENCE_DB;
  const avgVolumeDb = rms > 0 ? 20 * Math.log10(rms) : SILENCE_DB;
  const clippingDetected = clippingSamplesCount > CLIPPING_SAMPLE_TOLERANCE;

  // Estimate Noise Floor (finding the quietest 100ms segment RMS value)
  const segmentSize = Math.floor(sampleRate * 0.1); // 100ms segment
  let minRmsValue = 1.0;

  if (segmentSize > 0) {
    for (let start = 0; start < leftChannelData.length - segmentSize; start += segmentSize) {
      let sumSq = 0;
      for (let j = start; j < start + segmentSize; j++) {
        sumSq += leftChannelData[j] * leftChannelData[j];
      }
      const segRms = Math.sqrt(sumSq / segmentSize);
      if (segRms < minRmsValue && segRms > 0.0001) {
        minRmsValue = segRms;
      }
    }
  }
  const estimatedNoiseFloorDb =
    minRmsValue < 1.0 ? 20 * Math.log10(minRmsValue) : DEFAULT_NOISE_FLOOR_DB;

  // Zero-crossing peak rate or prominent voice frequencies
  // Let's create an approximate frequency pitch analysis model
  let zeroCrossings = 0;
  for (let i = 1; i < leftChannelData.length; i++) {
    if (leftChannelData[i - 1] < 0 && leftChannelData[i] >= 0) {
      zeroCrossings++;
    }
  }
  const avgFrequencyHz =
    leftChannelData.length > 0
      ? Math.min(12000, Math.floor((zeroCrossings * sampleRate) / (2 * leftChannelData.length)))
      : 0;

  // Generate peak bands based on average frequency crossing rate
  const frequencyPeaks = [
    Math.floor(avgFrequencyHz * 0.5),
    avgFrequencyHz,
    Math.floor(avgFrequencyHz * 1.5),
    Math.floor(avgFrequencyHz * 3),
  ]
    .filter((f) => f > 30 && f < 18000)
    .sort((a, b) => a - b);

  return {
    duration,
    sampleRate,
    maxVolumeDb,
    avgVolumeDb,
    estimatedNoiseFloorDb,
    clippingDetected,
    frequencyPeaks: frequencyPeaks.length > 0 ? frequencyPeaks : [...FALLBACK_FREQUENCY_PEAKS],
    fileName,
    fileSize,
    mimeType: mimeType || "audio/wav",
  };
}
