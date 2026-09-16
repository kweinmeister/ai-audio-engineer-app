import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioContext, decodeAudioDataWithAutoClose } from "./audioContext";

type LegacyWindow = Window & {
  AudioContext?: unknown;
  webkitAudioContext?: unknown;
};

const legacyWindow = window as LegacyWindow;

afterEach(() => {
  legacyWindow.AudioContext = undefined;
  legacyWindow.webkitAudioContext = undefined;
  vi.restoreAllMocks();
});

describe("createAudioContext", () => {
  it("uses the standard constructor when available", () => {
    const StandardCtor = vi.fn();
    legacyWindow.AudioContext = StandardCtor;

    createAudioContext();

    expect(StandardCtor).toHaveBeenCalledTimes(1);
  });

  it("falls back to the prefixed Safari constructor", () => {
    const WebkitCtor = vi.fn();
    legacyWindow.webkitAudioContext = WebkitCtor;

    createAudioContext();

    expect(WebkitCtor).toHaveBeenCalledTimes(1);
  });

  it("throws a readable error when Web Audio is unavailable", () => {
    expect(() => createAudioContext()).toThrow(/not supported/i);
  });
});

describe("decodeAudioDataWithAutoClose", () => {
  it("decodes array buffer and automatically closes temporary AudioContext on success", async () => {
    const mockBuffer = {} as AudioBuffer;
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockDecode = vi.fn().mockResolvedValue(mockBuffer);

    class MockContext {
      decodeAudioData = mockDecode;
      close = mockClose;
    }
    legacyWindow.AudioContext = MockContext;

    const arrayBuffer = new ArrayBuffer(16);
    const result = await decodeAudioDataWithAutoClose(arrayBuffer);

    expect(mockDecode).toHaveBeenCalledWith(arrayBuffer);
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(result).toBe(mockBuffer);
  });

  it("ensures AudioContext is closed even if decodeAudioData fails", async () => {
    const mockClose = vi.fn().mockResolvedValue(undefined);
    const mockDecode = vi.fn().mockRejectedValue(new Error("Corrupted audio"));

    class MockContext {
      decodeAudioData = mockDecode;
      close = mockClose;
    }
    legacyWindow.AudioContext = MockContext;

    const arrayBuffer = new ArrayBuffer(16);
    await expect(decodeAudioDataWithAutoClose(arrayBuffer)).rejects.toThrow("Corrupted audio");

    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
