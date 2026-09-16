import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MasteringPlan } from "../types";
import { ExportModal } from "./ExportModal";

function createMockAudioBuffer(channels = 2, length = 44100 * 5, sampleRate = 44100): AudioBuffer {
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: () => new Float32Array(length),
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

const mockPlan: MasteringPlan = {
  gainDb: 1.5,
  highpassHz: 40,
  lowpassHz: 18000,
  eq: {
    bass: { hz: 80, gain: 2.0 },
    mid: { hz: 1000, gain: -1.0 },
    treble: { hz: 10000, gain: 1.5 },
  },
  compressorThreshold: -18,
  compressorRatio: 2.0,
  planDescription: "Test master plan",
};

describe("ExportModal", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <ExportModal
        isOpen={false}
        onClose={vi.fn()}
        audioBuffer={createMockAudioBuffer()}
        masteringPlan={mockPlan}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders modal with default settings and audio telemetry when isOpen is true", () => {
    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        audioBuffer={createMockAudioBuffer(2, 44100 * 10, 44100)}
        masteringPlan={mockPlan}
        originalFileName="podcast_episode.wav"
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Export Master Audio/i)).toBeInTheDocument();
    // Default prefilled filename
    const filenameInput = screen.getByDisplayValue("podcast_episode-mastered.wav");
    expect(filenameInput).toBeInTheDocument();
    // Audio telemetry badges
    expect(screen.getByText(/44.1 kHz/i)).toBeInTheDocument();
    expect(screen.getByText(/Stereo/i)).toBeInTheDocument();
  });

  it("calls onClose when Close button or Cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <ExportModal
        isOpen={true}
        onClose={onClose}
        audioBuffer={createMockAudioBuffer()}
        masteringPlan={mockPlan}
      />,
    );

    const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("allows switching bit depth between 24-bit and 16-bit", () => {
    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        audioBuffer={createMockAudioBuffer()}
        masteringPlan={mockPlan}
      />,
    );

    const bit16Btn = screen.getByRole("button", { name: /16-bit/i });
    fireEvent.click(bit16Btn);
    expect(bit16Btn).toHaveClass("border-cyan-500");
  });

  it("allows changing peak normalization preset", () => {
    render(
      <ExportModal
        isOpen={true}
        onClose={vi.fn()}
        audioBuffer={createMockAudioBuffer()}
        masteringPlan={mockPlan}
      />,
    );

    const select = screen.getByRole("combobox", { name: /Ceiling Normalization/i });
    fireEvent.change(select, { target: { value: "cd" } });
    expect(select).toHaveValue("cd");
  });
});
