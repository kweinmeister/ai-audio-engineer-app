import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MASTERING_PLAN, type MasteringPlan } from "../types";
import { StudioRack } from "./StudioRack";

describe("StudioRack", () => {
  const mockPlan: MasteringPlan = {
    ...DEFAULT_MASTERING_PLAN,
    gainDb: 2.0,
    highpassHz: 40,
    lowpassHz: 16000,
    eq: {
      bass: { hz: 80, gain: 1.5 },
      mid: { hz: 1000, gain: -2.0 },
      treble: { hz: 10000, gain: 3.0 },
    },
    planDescription: "Custom test mastering profile.",
  };

  it("renders readouts and slider values correctly", () => {
    render(
      <StudioRack
        masteringPlan={mockPlan}
        onPlanChange={vi.fn()}
        isDspActive={true}
        onToggleDsp={vi.fn()}
      />,
    );

    expect(screen.getByTestId("gain-readout")).toHaveTextContent("+2.0 dB");
    expect(screen.getByTestId("hpf-readout")).toHaveTextContent("40 Hz");
    expect(screen.getByTestId("lpf-readout")).toHaveTextContent("16000 Hz");
    expect(screen.getByTestId("bass-readout")).toHaveTextContent("+1.5 dB");
    expect(screen.getByTestId("mid-readout")).toHaveTextContent("-2.0 dB");
    expect(screen.getByTestId("treble-readout")).toHaveTextContent("+3.0 dB");
    expect(screen.getByTestId("plan-description-readout")).toHaveTextContent(
      "Custom test mastering profile.",
    );
  });

  it("renders Off (Flat), Off (20 kHz), and Bypass (1.0:1) when default filters/ratio are inactive", () => {
    render(
      <StudioRack
        masteringPlan={DEFAULT_MASTERING_PLAN}
        onPlanChange={vi.fn()}
        isDspActive={true}
        onToggleDsp={vi.fn()}
      />,
    );

    expect(screen.getByTestId("hpf-readout")).toHaveTextContent("Off (Flat)");
    expect(screen.getByTestId("lpf-readout")).toHaveTextContent("Off (20 kHz)");
    expect(screen.getByTestId("compressor-ratio-readout")).toHaveTextContent("Bypass (1.0:1)");
  });

  it("invokes onToggleDsp when bypass button is clicked", () => {
    const handleToggle = vi.fn();
    render(
      <StudioRack
        masteringPlan={mockPlan}
        onPlanChange={vi.fn()}
        isDspActive={true}
        onToggleDsp={handleToggle}
      />,
    );

    const toggleButton = screen.getByRole("button", { name: /MASTERING ON/i });
    fireEvent.click(toggleButton);

    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it("invokes onPlanChange when gain slider is adjusted", () => {
    const handleChange = vi.fn();
    render(
      <StudioRack
        masteringPlan={mockPlan}
        onPlanChange={handleChange}
        isDspActive={true}
        onToggleDsp={vi.fn()}
      />,
    );

    const gainSlider = screen.getByLabelText("Makeup Gain");
    fireEvent.change(gainSlider, { target: { value: "4.5" } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        gainDb: 4.5,
      }),
    );
  });

  it("invokes onPlanChange with updated nested EQ band when bass is adjusted", () => {
    const handleChange = vi.fn();
    render(
      <StudioRack
        masteringPlan={mockPlan}
        onPlanChange={handleChange}
        isDspActive={true}
        onToggleDsp={vi.fn()}
      />,
    );

    const bassSlider = screen.getByLabelText("Bass Gain");
    fireEvent.change(bassSlider, { target: { value: "3.5" } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        eq: expect.objectContaining({
          bass: { hz: 80, gain: 3.5 },
        }),
      }),
    );
  });

  it("invokes onPlanChange when mid and treble gain sliders are adjusted", () => {
    const handleChange = vi.fn();
    render(
      <StudioRack
        masteringPlan={mockPlan}
        onPlanChange={handleChange}
        isDspActive={true}
        onToggleDsp={vi.fn()}
      />,
    );

    const midSlider = screen.getByLabelText("Mid Gain");
    fireEvent.change(midSlider, { target: { value: "-1.5" } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        eq: expect.objectContaining({
          mid: { hz: 1000, gain: -1.5 },
        }),
      }),
    );

    const trebleSlider = screen.getByLabelText("Treble Gain");
    fireEvent.change(trebleSlider, { target: { value: "2.5" } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        eq: expect.objectContaining({
          treble: { hz: 10000, gain: 2.5 },
        }),
      }),
    );
  });

  it("renders reset button when hasAiPlan is true and invokes callback", () => {
    const handleReset = vi.fn();
    render(
      <StudioRack
        masteringPlan={mockPlan}
        onPlanChange={vi.fn()}
        isDspActive={true}
        onToggleDsp={vi.fn()}
        hasAiPlan={true}
        onResetToAi={handleReset}
      />,
    );

    const resetButton = screen.getByRole("button", { name: /Reset/i });
    fireEvent.click(resetButton);

    expect(handleReset).toHaveBeenCalledTimes(1);
  });

  it("renders export button when onExportMaster is provided and triggers callback", () => {
    const handleExport = vi.fn();
    render(
      <StudioRack
        masteringPlan={mockPlan}
        onPlanChange={vi.fn()}
        isDspActive={true}
        onToggleDsp={vi.fn()}
        onExportMaster={handleExport}
      />,
    );

    const exportButton = screen.getByRole("button", { name: /Export/i });
    fireEvent.click(exportButton);

    expect(handleExport).toHaveBeenCalledTimes(1);
  });
});
