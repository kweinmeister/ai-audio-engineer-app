/**
 * High-performance, client-side audio rendering and WAV encoder for mastered audio.
 *
 * Provides faster-than-realtime DSP rendering via OfflineAudioContext,
 * sample-accurate peak normalization to EBU/AES standards (-1.0 dBFS / -0.1 dBFS),
 * and lossless 16-bit / 24-bit PCM WAV encoding with TPDF dither under Apache 2.0.
 */

import type { MasteringPlan } from "../types";
import { formatBytes } from "./format";

export interface EncodeWavOptions {
  /** Bit depth of the PCM WAV: 16-bit (CD standard) or 24-bit (Studio Master). */
  bitDepth?: 16 | 24;
  /** Apply Triangular Probability Density Function (TPDF) dither on 16-bit downsampling. */
  dither?: boolean;
}

export interface RenderMasterOptions {
  /** Whether to apply the mastering DSP rack or export raw unprocessed audio. */
  applyDsp?: boolean;
  /** Target True Peak ceiling in dBFS (e.g. -1.0 for streaming, -0.1 for CD, or null for raw). */
  normalizeCeilingDb?: number | null;
}

/**
 * Calculate expected file size in bytes for a PCM WAV file.
 */
export function estimateWavSizeBytes(
  durationSec: number,
  sampleRate: number,
  channels: number,
  bitDepth: 16 | 24,
): number {
  const bytesPerSample = bitDepth / 8;
  const numFrames = Math.floor(durationSec * sampleRate);
  const dataSizeBytes = numFrames * channels * bytesPerSample;
  return 44 + dataSizeBytes;
}

/**
 * Format a byte size estimate into a human-readable string (e.g. "14.2 MB").
 */
export function formatWavSizeEstimate(
  durationSec: number,
  sampleRate: number,
  channels: number,
  bitDepth: 16 | 24,
): string {
  const bytes = estimateWavSizeBytes(durationSec, sampleRate, channels, bitDepth);
  return formatBytes(bytes);
}

/**
 * Scale audio buffer samples uniformly so the maximum absolute peak matches
 * the specified target ceiling in dBFS.
 */
export function normalizeAudioBufferPeaks(buffer: AudioBuffer, targetCeilingDb: number): void {
  const numChannels = buffer.numberOfChannels;
  let maxPeak = 0;

  // Scan for absolute peak across all channels
  for (let c = 0; c < numChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const absVal = Math.abs(data[i]);
      if (absVal > maxPeak) {
        maxPeak = absVal;
      }
    }
  }

  // If completely silent, return without modification
  if (maxPeak <= 0) return;

  const targetLinear = 10 ** (targetCeilingDb / 20);
  const scale = targetLinear / maxPeak;

  // Apply linear scaling to all channels
  for (let c = 0; c < numChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      data[i] *= scale;
    }
  }
}

/**
 * Encode an AudioBuffer into an uncompressed 16-bit or 24-bit PCM WAV Blob.
 */
export function encodeWav(buffer: AudioBuffer, options: EncodeWavOptions = {}): Blob {
  const bitDepth = options.bitDepth ?? 24;
  const dither = options.dither ?? bitDepth === 16;
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const totalSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // RIFF Header
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");

  // "fmt " Subchunk
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  // "data" Subchunk
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Extract channel float arrays
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;

  if (bitDepth === 16) {
    for (let i = 0; i < numFrames; i++) {
      for (let c = 0; c < numChannels; c++) {
        let sample = channels[c][i];

        // Apply Triangular Probability Density Function (TPDF) dither for 16-bit
        if (dither) {
          const ditherVal = (Math.random() - Math.random()) / 32768;
          sample += ditherVal;
        }

        // Clamp to [-1.0, 1.0]
        const clamped = Math.max(-1, Math.min(1, sample));
        const intSample = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);

        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }
  } else {
    // 24-bit PCM (3 bytes per sample, little-endian)
    for (let i = 0; i < numFrames; i++) {
      for (let c = 0; c < numChannels; c++) {
        const sample = channels[c][i];
        const clamped = Math.max(-1, Math.min(1, sample));
        const intSample =
          clamped < 0 ? Math.round(clamped * 8388608) : Math.round(clamped * 8388607);

        view.setUint8(offset, intSample & 0xff);
        view.setUint8(offset + 1, (intSample >> 8) & 0xff);
        view.setUint8(offset + 2, (intSample >> 16) & 0xff);
        offset += 3;
      }
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/**
 * Render mastered audio faster-than-realtime using OfflineAudioContext.
 */
export async function renderOfflineMasteredAudio(
  sourceBuffer: AudioBuffer,
  plan: MasteringPlan,
  options: RenderMasterOptions = {},
): Promise<AudioBuffer> {
  const applyDsp = options.applyDsp ?? true;
  const numChannels = sourceBuffer.numberOfChannels;
  const length = sourceBuffer.length;
  const sampleRate = sourceBuffer.sampleRate;

  const OfflineCtxClass =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (!OfflineCtxClass) {
    throw new Error("OfflineAudioContext is not supported by this browser.");
  }

  const offlineCtx = new OfflineCtxClass(numChannels, length, sampleRate);

  // Create source
  const source = offlineCtx.createBufferSource();
  source.buffer = sourceBuffer;

  if (applyDsp) {
    // 1. Makeup gain
    const gainNode = offlineCtx.createGain();
    const linearGain = 10 ** (plan.gainDb / 20);
    gainNode.gain.setValueAtTime(linearGain, 0);

    // 2. Highpass filter
    const highpassNode = offlineCtx.createBiquadFilter();
    if (plan.highpassHz > 15) {
      highpassNode.type = "highpass";
      highpassNode.frequency.setValueAtTime(plan.highpassHz, 0);
    } else {
      highpassNode.type = "allpass";
    }

    // 3. Lowpass filter
    const lowpassNode = offlineCtx.createBiquadFilter();
    if (plan.lowpassHz < 19500) {
      lowpassNode.type = "lowpass";
      lowpassNode.frequency.setValueAtTime(plan.lowpassHz, 0);
    } else {
      lowpassNode.type = "allpass";
    }

    // 4. Parametric EQ bands (Q = 1.0)
    const bassEQ = offlineCtx.createBiquadFilter();
    bassEQ.type = "peaking";
    bassEQ.Q.setValueAtTime(1.0, 0);
    bassEQ.frequency.setValueAtTime(plan.eq.bass.hz, 0);
    bassEQ.gain.setValueAtTime(plan.eq.bass.gain, 0);

    const midEQ = offlineCtx.createBiquadFilter();
    midEQ.type = "peaking";
    midEQ.Q.setValueAtTime(1.0, 0);
    midEQ.frequency.setValueAtTime(plan.eq.mid.hz, 0);
    midEQ.gain.setValueAtTime(plan.eq.mid.gain, 0);

    const trebleEQ = offlineCtx.createBiquadFilter();
    trebleEQ.type = "peaking";
    trebleEQ.Q.setValueAtTime(1.0, 0);
    trebleEQ.frequency.setValueAtTime(plan.eq.treble.hz, 0);
    trebleEQ.gain.setValueAtTime(plan.eq.treble.gain, 0);

    // 5. Dynamics compressor
    const compressor = offlineCtx.createDynamicsCompressor();
    if (plan.compressorRatio > 1.01) {
      compressor.threshold.setValueAtTime(plan.compressorThreshold, 0);
      compressor.ratio.setValueAtTime(plan.compressorRatio, 0);
      compressor.attack.setValueAtTime(0.012, 0);
      compressor.release.setValueAtTime(0.22, 0);
      compressor.knee.setValueAtTime(25, 0);
    } else {
      compressor.ratio.setValueAtTime(1.0, 0);
    }

    // Connect audio processing pipeline
    source
      .connect(gainNode)
      .connect(highpassNode)
      .connect(lowpassNode)
      .connect(bassEQ)
      .connect(midEQ)
      .connect(trebleEQ)
      .connect(compressor)
      .connect(offlineCtx.destination);
  } else {
    // Direct bypass
    source.connect(offlineCtx.destination);
  }

  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();

  // Apply optional peak ceiling normalization
  if (options.normalizeCeilingDb != null) {
    normalizeAudioBufferPeaks(renderedBuffer, options.normalizeCeilingDb);
  }

  return renderedBuffer;
}

/**
 * Trigger client-side file download for an audio Blob.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 3000);
}

/**
 * Helper to write ASCII strings into a DataView.
 */
function writeAscii(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
