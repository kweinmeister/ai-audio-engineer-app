import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MASTERING_PLAN } from "../types";
import { useAudioPipeline } from "./useAudioPipeline";

function createMockAudioContext() {
  const createParam = () => ({
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    value: 0,
  });

  const createFilter = () => ({
    type: "peaking",
    frequency: createParam(),
    gain: createParam(),
    Q: createParam(),
    connect: vi.fn(),
  });

  const mockSource = {
    buffer: null as unknown,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };

  const mockCtx = {
    currentTime: 10,
    state: "running",
    destination: {},
    createBiquadFilter: vi.fn(createFilter),
    createDynamicsCompressor: vi.fn(() => ({
      threshold: createParam(),
      ratio: createParam(),
      attack: createParam(),
      release: createParam(),
      knee: createParam(),
      connect: vi.fn(),
    })),
    createGain: vi.fn(() => ({
      gain: createParam(),
      connect: vi.fn(),
    })),
    createAnalyser: vi.fn(() => ({
      fftSize: 256,
      frequencyBinCount: 128,
      connect: vi.fn(),
    })),
    createBufferSource: vi.fn(() => mockSource),
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };

  return { mockCtx, mockSource };
}

describe("useAudioPipeline", () => {
  const originalAudioContext = window.AudioContext;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    window.AudioContext = originalAudioContext;
    vi.restoreAllMocks();
  });

  it("initializes with default mastering plan and inactive playback", () => {
    const { result } = renderHook(() => useAudioPipeline());

    expect(result.current.isPlaying).toBe(false);
    expect(result.current.playbackProgress).toBe(0);
    expect(result.current.currentTime).toBe(0);
    expect(result.current.duration).toBe(0);
    expect(result.current.isDspActive).toBe(true);
    expect(result.current.masteringPlan).toEqual(DEFAULT_MASTERING_PLAN);
  });

  it("toggles DSP bypass mode", () => {
    const { result } = renderHook(() => useAudioPipeline());

    expect(result.current.isDspActive).toBe(true);

    act(() => {
      result.current.toggleDsp();
    });

    expect(result.current.isDspActive).toBe(false);
  });

  it("builds the audio chain when initializing a buffer", async () => {
    const { mockCtx } = createMockAudioContext();
    class MockAudioContext {
      constructor() {
        Object.assign(this, mockCtx);
      }
    }
    window.AudioContext = MockAudioContext as unknown as typeof AudioContext;

    const { result } = renderHook(() => useAudioPipeline());
    const mockBuffer = { duration: 30 } as AudioBuffer;

    await act(async () => {
      await result.current.initAudioChain(mockBuffer);
    });

    expect(mockCtx.createBiquadFilter).toHaveBeenCalled();
    expect(mockCtx.createDynamicsCompressor).toHaveBeenCalled();
    expect(mockCtx.createGain).toHaveBeenCalled();
    expect(mockCtx.createAnalyser).toHaveBeenCalled();
  });

  it("resets pipeline state cleanly", () => {
    const { result } = renderHook(() => useAudioPipeline());

    act(() => {
      result.current.setRawAudioBuffer({ duration: 45 } as AudioBuffer);
      result.current.setIsDspActive(false);
    });

    act(() => {
      result.current.resetPipeline();
    });

    expect(result.current.rawAudioBuffer).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isDspActive).toBe(true);
    expect(result.current.currentTime).toBe(0);
  });

  it("updates DSP node parameters according to mastering plan", async () => {
    const { mockCtx } = createMockAudioContext();
    class MockAudioContext {
      constructor() {
        Object.assign(this, mockCtx);
      }
    }
    window.AudioContext = MockAudioContext as unknown as typeof AudioContext;

    const { result } = renderHook(() => useAudioPipeline());
    const mockBuffer = { duration: 30 } as AudioBuffer;

    await act(async () => {
      await result.current.initAudioChain(mockBuffer);
    });

    // Custom mastering plan matching industry standards
    const customPlan = {
      gainDb: 3.0,
      highpassHz: 80,
      lowpassHz: 16000,
      eq: {
        bass: { hz: 100, gain: 2.0 },
        mid: { hz: 1200, gain: -1.5 },
        treble: { hz: 11000, gain: 1.0 },
      },
      compressorThreshold: -18,
      compressorRatio: 2.5,
      planDescription: "Standard mastering profile",
    };

    act(() => {
      result.current.setMasteringPlan(customPlan);
    });

    const gainNode = mockCtx.createGain.mock.results[0].value;
    const expectedLinearGain = 10 ** (3.0 / 20);
    expect(gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      expect.closeTo(expectedLinearGain, 4),
      expect.any(Number),
    );

    const compressorNode = mockCtx.createDynamicsCompressor.mock.results[0].value;
    expect(compressorNode.threshold.setValueAtTime).toHaveBeenCalledWith(-18, expect.any(Number));
    expect(compressorNode.ratio.setValueAtTime).toHaveBeenCalledWith(2.5, expect.any(Number));
    expect(compressorNode.attack.setValueAtTime).toHaveBeenCalledWith(0.012, expect.any(Number));
    expect(compressorNode.release.setValueAtTime).toHaveBeenCalledWith(0.22, expect.any(Number));
    expect(compressorNode.knee.setValueAtTime).toHaveBeenCalledWith(25, expect.any(Number));
  });

  it("resets DSP node parameters to transparent bypass values when DSP is disabled", async () => {
    const { mockCtx } = createMockAudioContext();
    class MockAudioContext {
      constructor() {
        Object.assign(this, mockCtx);
      }
    }
    window.AudioContext = MockAudioContext as unknown as typeof AudioContext;

    const { result } = renderHook(() => useAudioPipeline());
    await act(async () => {
      await result.current.initAudioChain({ duration: 30 } as AudioBuffer);
    });

    act(() => {
      result.current.setIsDspActive(false);
    });

    const gainNode = mockCtx.createGain.mock.results[0].value;
    expect(gainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1.0, expect.any(Number));

    const compressorNode = mockCtx.createDynamicsCompressor.mock.results[0].value;
    expect(compressorNode.ratio.setValueAtTime).toHaveBeenCalledWith(1.0, expect.any(Number));
  });
});
