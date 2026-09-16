import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AudioFeatures } from "../types";
import { SpectralSpecs } from "./SpectralSpecs";

describe("SpectralSpecs", () => {
  const mockFeatures: AudioFeatures = {
    duration: 30.5,
    sampleRate: 48000,
    maxVolumeDb: -1.2,
    avgVolumeDb: -14.0,
    estimatedNoiseFloorDb: -52.0,
    clippingDetected: true,
    frequencyPeaks: [100, 250, 4000],
    fileName: "take_1.wav",
    fileSize: 2048,
    mimeType: "audio/wav",
  };

  it("renders standby message when features are null", () => {
    render(<SpectralSpecs features={null} />);

    expect(screen.getByText("SPECS RACK STANDBY")).toBeInTheDocument();
  });

  it("renders telemetry numbers, score, and clipping indicator when features are supplied", () => {
    render(<SpectralSpecs features={mockFeatures} score={85} />);

    expect(screen.getByTestId("score-readout")).toHaveTextContent("85/100");
    expect(screen.getByTestId("peak-volume-readout")).toHaveTextContent("-1.2 dBFS");
    expect(screen.getByTestId("avg-loudness-readout")).toHaveTextContent("-14.0 dBFS");
    expect(screen.getByTestId("noise-floor-readout")).toHaveTextContent("-52.0 dBFS");
    expect(screen.getByTestId("clipping-badge")).toHaveTextContent("CLIPPING WARNING");
    expect(screen.getByText("100 Hz")).toBeInTheDocument();
    expect(screen.getByText("48000 Hz")).toBeInTheDocument();
  });

  it.each([
    { score: 88, expectedClass: "text-emerald-400" },
    { score: 62, expectedClass: "text-amber-400" },
    { score: 35, expectedClass: "text-rose-400" },
    { score: null, expectedClass: "text-slate-400" },
  ])("applies $expectedClass when score is $score", ({ score, expectedClass }) => {
    render(<SpectralSpecs features={mockFeatures} score={score} />);
    expect(screen.getByTestId("score-readout")).toHaveClass(expectedClass);
  });

  it("renders SAFE / BALANCED when clipping is not detected and adheres to headroom thresholds", () => {
    const safeFeatures = {
      ...mockFeatures,
      maxVolumeDb: -3.0,
      estimatedNoiseFloorDb: -62.0,
      clippingDetected: false,
    };
    render(<SpectralSpecs features={safeFeatures} score={90} />);

    const badge = screen.getByTestId("clipping-badge");
    expect(badge).toHaveTextContent("SAFE / BALANCED");
    expect(badge).toHaveClass("text-emerald-300");

    const peak = screen.getByTestId("peak-volume-readout");
    expect(peak).toHaveClass("text-slate-200");

    const noise = screen.getByTestId("noise-floor-readout");
    expect(noise).toHaveClass("text-emerald-400");
  });

  it("warns when noise floor exceeds -45 dBFS threshold", () => {
    const noisyFeatures = {
      ...mockFeatures,
      estimatedNoiseFloorDb: -38.0,
    };
    render(<SpectralSpecs features={noisyFeatures} score={45} />);

    const noise = screen.getByTestId("noise-floor-readout");
    expect(noise).toHaveClass("text-amber-400");
  });
});
