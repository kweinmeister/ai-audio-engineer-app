import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioContext } from "./audioContext";

type LegacyWindow = Window & {
  AudioContext?: unknown;
  webkitAudioContext?: unknown;
};

const legacyWindow = window as LegacyWindow;

afterEach(() => {
  legacyWindow.AudioContext = undefined;
  legacyWindow.webkitAudioContext = undefined;
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
