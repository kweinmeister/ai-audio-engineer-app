import { describe, expect, it } from "vitest";
import {
  encodeWav,
  estimateWavSizeBytes,
  formatWavSizeEstimate,
  normalizeAudioBufferPeaks,
} from "./audioExport";

/**
 * Mock AudioBuffer for unit testing in Node/Vitest environment.
 */
function createMockAudioBuffer(
  channels: number,
  length: number,
  sampleRate: number,
  fillValue = 0.5,
): AudioBuffer {
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const data = new Float32Array(length);
    data.fill(fillValue);
    channelData.push(data);
  }

  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (ch: number) => channelData[ch] || new Float32Array(length),
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

describe("audioExport", () => {
  describe("estimateWavSizeBytes & formatWavSizeEstimate", () => {
    it("calculates correct byte size for 16-bit and 24-bit audio", () => {
      const bytes16 = estimateWavSizeBytes(10, 44100, 2, 16);
      expect(bytes16).toBe(1764044);

      const bytes24 = estimateWavSizeBytes(10, 44100, 2, 24);
      expect(bytes24).toBe(2646044);
    });

    it("formats readable file size string", () => {
      const formatted = formatWavSizeEstimate(10, 44100, 2, 16);
      expect(formatted).toBe("1.68 MB");
    });
  });

  describe("encodeWav", () => {
    it("encodes 16-bit stereo WAV with correct RIFF headers", async () => {
      const mockBuffer = createMockAudioBuffer(2, 1000, 44100, 0.25);
      const blob = encodeWav(mockBuffer, { bitDepth: 16, dither: false });

      expect(blob.type).toBe("audio/wav");
      const arrayBuffer = await blob.arrayBuffer();
      const view = new DataView(arrayBuffer);

      // RIFF header
      expect(
        String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)),
      ).toBe("RIFF");
      expect(
        String.fromCharCode(
          view.getUint8(8),
          view.getUint8(9),
          view.getUint8(10),
          view.getUint8(11),
        ),
      ).toBe("WAVE");
      expect(
        String.fromCharCode(
          view.getUint8(12),
          view.getUint8(13),
          view.getUint8(14),
          view.getUint8(15),
        ),
      ).toBe("fmt ");

      // Audio format: 1 (PCM)
      expect(view.getUint16(20, true)).toBe(1);
      // Channels: 2
      expect(view.getUint16(22, true)).toBe(2);
      // Sample Rate: 44100
      expect(view.getUint32(24, true)).toBe(44100);
      // Byte Rate: 44100 * 2 * 2 = 176400
      expect(view.getUint32(28, true)).toBe(176400);
      // Block Align: 2 * 2 = 4
      expect(view.getUint16(32, true)).toBe(4);
      // Bits per sample: 16
      expect(view.getUint16(34, true)).toBe(16);

      // Data chunk
      expect(
        String.fromCharCode(
          view.getUint8(36),
          view.getUint8(37),
          view.getUint8(38),
          view.getUint8(39),
        ),
      ).toBe("data");
      expect(view.getUint32(40, true)).toBe(1000 * 2 * 2); // 4000 bytes
    });

    it("encodes 24-bit mono WAV with correct RIFF headers", async () => {
      const mockBuffer = createMockAudioBuffer(1, 500, 48000, -0.5);
      const blob = encodeWav(mockBuffer, { bitDepth: 24 });

      expect(blob.type).toBe("audio/wav");
      const arrayBuffer = await blob.arrayBuffer();
      const view = new DataView(arrayBuffer);

      // Audio format: 1 (PCM)
      expect(view.getUint16(20, true)).toBe(1);
      // Channels: 1
      expect(view.getUint16(22, true)).toBe(1);
      // Sample Rate: 48000
      expect(view.getUint32(24, true)).toBe(48000);
      // Byte Rate: 48000 * 1 * 3 = 144000
      expect(view.getUint32(28, true)).toBe(144000);
      // Block Align: 1 * 3 = 3
      expect(view.getUint16(32, true)).toBe(3);
      // Bits per sample: 24
      expect(view.getUint16(34, true)).toBe(24);

      // Data chunk: 500 * 1 * 3 = 1500 bytes
      expect(view.getUint32(40, true)).toBe(1500);
      expect(arrayBuffer.byteLength).toBe(44 + 1500);
    });

    it("applies TPDF dither without exceeding 16-bit integer bounds", async () => {
      const mockBuffer = createMockAudioBuffer(1, 100, 44100, 1.0);
      const blob = encodeWav(mockBuffer, { bitDepth: 16, dither: true });
      const arrayBuffer = await blob.arrayBuffer();
      const view = new DataView(arrayBuffer);

      for (let i = 0; i < 100; i++) {
        const sample = view.getInt16(44 + i * 2, true);
        expect(sample).toBeLessThanOrEqual(32767);
        expect(sample).toBeGreaterThanOrEqual(-32768);
      }
    });
  });

  describe("normalizeAudioBufferPeaks", () => {
    it("scales samples so the maximum peak matches the target ceiling in dBFS", () => {
      const mockBuffer = createMockAudioBuffer(1, 100, 44100, 0.5);
      normalizeAudioBufferPeaks(mockBuffer, -1.0);

      const data = mockBuffer.getChannelData(0);
      const expectedPeak = 10 ** (-1.0 / 20);
      expect(data[0]).toBeCloseTo(expectedPeak, 4);
    });

    it("does nothing when buffer is completely silent", () => {
      const mockBuffer = createMockAudioBuffer(1, 100, 44100, 0.0);
      normalizeAudioBufferPeaks(mockBuffer, -1.0);

      const data = mockBuffer.getChannelData(0);
      expect(data[0]).toBe(0.0);
    });
  });
});
