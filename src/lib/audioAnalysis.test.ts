import { describe, expect, it } from "vitest";
import {
  type AnalyzableAudioBuffer,
  analyzeAudioBuffer,
  CLIPPING_SAMPLE_TOLERANCE,
  DEFAULT_NOISE_FLOOR_DB,
  FALLBACK_FREQUENCY_PEAKS,
  SILENCE_DB,
} from "./audioAnalysis";

/** Build a single channel buffer stub that satisfies the analyzer's contract. */
function makeBuffer(samples: ArrayLike<number>, sampleRate = 48000): AnalyzableAudioBuffer {
  const data = Float32Array.from(samples);
  return {
    duration: data.length / sampleRate,
    sampleRate,
    getChannelData: () => data,
  };
}

/** Generate a sine wave of the given frequency, amplitude, and duration. */
function makeSine(frequencyHz: number, amplitude: number, seconds: number, sampleRate = 48000) {
  const length = Math.floor(sampleRate * seconds);
  return Float32Array.from(
    { length },
    (_, i) => Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate) * amplitude,
  );
}

describe("analyzeAudioBuffer", () => {
  it("measures peak and RMS levels of a steady tone", () => {
    const buffer = makeBuffer(makeSine(1000, 0.5, 1));

    const features = analyzeAudioBuffer(buffer, "tone.wav", 2048, "audio/wav");

    // A 0.5 amplitude sine peaks at -6.02 dBFS and has an RMS of -9.03 dBFS.
    expect(features.maxVolumeDb).toBeCloseTo(-6.02, 1);
    expect(features.avgVolumeDb).toBeCloseTo(-9.03, 1);
    expect(features.clippingDetected).toBe(false);
    expect(features.duration).toBeCloseTo(1, 5);
    expect(features.sampleRate).toBe(48000);
  });

  it("reports ascending, in-range frequency peaks that track the source pitch", () => {
    const low = analyzeAudioBuffer(makeBuffer(makeSine(500, 0.5, 1)), "low.wav", 1, "audio/wav");
    const high = analyzeAudioBuffer(makeBuffer(makeSine(4000, 0.5, 1)), "high.wav", 1, "audio/wav");

    for (const peaks of [low.frequencyPeaks, high.frequencyPeaks]) {
      expect(peaks.length).toBeGreaterThan(0);
      expect([...peaks].sort((a, b) => a - b)).toEqual(peaks);
      expect(peaks.every((f) => f > 30 && f < 18000)).toBe(true);
    }
    expect(Math.max(...high.frequencyPeaks)).toBeGreaterThan(Math.max(...low.frequencyPeaks));
  });

  it("reports silence rather than negative infinity for an all-zero buffer", () => {
    const features = analyzeAudioBuffer(
      makeBuffer(new Float32Array(48000)),
      "s.wav",
      1,
      "audio/wav",
    );

    expect(features.maxVolumeDb).toBe(SILENCE_DB);
    expect(features.avgVolumeDb).toBe(SILENCE_DB);
    expect(features.estimatedNoiseFloorDb).toBe(DEFAULT_NOISE_FLOOR_DB);
    expect(features.frequencyPeaks).toEqual(FALLBACK_FREQUENCY_PEAKS);
  });

  it("handles an empty buffer without producing NaN", () => {
    const features = analyzeAudioBuffer(makeBuffer([], 48000), "empty.wav", 0, "audio/wav");

    expect(features.maxVolumeDb).toBe(SILENCE_DB);
    expect(features.avgVolumeDb).toBe(SILENCE_DB);
    expect(features.estimatedNoiseFloorDb).toBe(DEFAULT_NOISE_FLOOR_DB);
    expect(features.frequencyPeaks).toEqual(FALLBACK_FREQUENCY_PEAKS);
    expect(features.duration).toBe(0);
  });

  it("tolerates a few clipped samples but flags sustained clipping", () => {
    const withinTolerance = new Float32Array(1000).fill(0.1);
    withinTolerance.fill(1.0, 0, CLIPPING_SAMPLE_TOLERANCE);
    const overTolerance = new Float32Array(1000).fill(0.1);
    overTolerance.fill(1.0, 0, CLIPPING_SAMPLE_TOLERANCE + 1);

    expect(
      analyzeAudioBuffer(makeBuffer(withinTolerance), "a.wav", 1, "audio/wav").clippingDetected,
    ).toBe(false);
    expect(
      analyzeAudioBuffer(makeBuffer(overTolerance), "b.wav", 1, "audio/wav").clippingDetected,
    ).toBe(true);
  });

  it("estimates the noise floor from the quietest segment", () => {
    const sampleRate = 1000;
    const samples = new Float32Array(1000);
    for (let i = 0; i < 500; i++) {
      samples[i] = i % 2 === 0 ? 0.5 : -0.5;
    }
    samples.fill(0.001, 500);

    const features = analyzeAudioBuffer(makeBuffer(samples, sampleRate), "n.wav", 1, "audio/wav");

    // The quiet tail sits at 0.001 RMS, i.e. -60 dBFS.
    expect(features.estimatedNoiseFloorDb).toBeCloseTo(-60, 1);
    expect(features.estimatedNoiseFloorDb).toBeLessThan(features.avgVolumeDb);
  });

  it("passes through file metadata and falls back to audio/wav for an unknown type", () => {
    const buffer = makeBuffer(makeSine(440, 0.2, 0.1));

    const named = analyzeAudioBuffer(buffer, "take-1.mp3", 12345, "audio/mpeg");
    expect(named).toMatchObject({
      fileName: "take-1.mp3",
      fileSize: 12345,
      mimeType: "audio/mpeg",
    });

    expect(analyzeAudioBuffer(buffer, "take-2", 1, "").mimeType).toBe("audio/wav");
  });
});
