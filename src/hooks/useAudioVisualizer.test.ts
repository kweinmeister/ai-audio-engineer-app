import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioVisualizer } from "./useAudioVisualizer";

describe("useAudioVisualizer", () => {
  let mockRafId: number;
  let rafCallbacks: Array<(time: number) => void>;

  beforeEach(() => {
    mockRafId = 1;
    rafCallbacks = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return ++mockRafId;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockCanvas(width = 600, height = 200) {
    const mockContext = {
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      createLinearGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    const canvas = {
      width,
      height,
      clientWidth: width,
      clientHeight: height,
      getContext: vi.fn().mockReturnValue(mockContext),
    } as unknown as HTMLCanvasElement;

    return { canvas, mockContext };
  }

  it("schedules requestAnimationFrame and draws to canvas context when active", () => {
    const { canvas, mockContext } = createMockCanvas(500, 100);
    const canvasRef = { current: canvas };
    const analyserNodeRef = { current: null };

    renderHook(() =>
      useAudioVisualizer({
        canvasRef,
        analyserNodeRef,
        isActive: true,
      }),
    );

    expect(window.requestAnimationFrame).toHaveBeenCalled();
    expect(mockContext.fillRect).toHaveBeenCalledWith(0, 0, 500, 100);
  });

  it("adjusts canvas internal resolution for device pixel ratio", () => {
    const { canvas } = createMockCanvas(400, 150);
    const canvasRef = { current: canvas };
    const analyserNodeRef = { current: null };

    // Set DPR to 2
    Object.defineProperty(window, "devicePixelRatio", {
      writable: true,
      configurable: true,
      value: 2,
    });

    renderHook(() =>
      useAudioVisualizer({
        canvasRef,
        analyserNodeRef,
        isActive: true,
      }),
    );

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(300);
  });

  it("cancels animation frame when unmounted or deactivated", () => {
    const { canvas } = createMockCanvas();
    const canvasRef = { current: canvas };
    const analyserNodeRef = { current: null };

    const { unmount, rerender } = renderHook(
      ({ isActive }) =>
        useAudioVisualizer({
          canvasRef,
          analyserNodeRef,
          isActive,
        }),
      { initialProps: { isActive: true } },
    );

    expect(window.cancelAnimationFrame).not.toHaveBeenCalled();

    rerender({ isActive: false });
    expect(window.cancelAnimationFrame).toHaveBeenCalled();

    unmount();
  });
});
