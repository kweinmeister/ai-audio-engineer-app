import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AudioAnalyzerDeck from "./AudioAnalyzerDeck";

/** Stub the parts of AudioBuffer the deck reads when rendering its summary. */
function stubAudioBuffer(overrides: Partial<AudioBuffer> = {}): AudioBuffer {
  return {
    numberOfChannels: 2,
    length: 48000,
    sampleRate: 48000,
    duration: 1,
    ...overrides,
  } as AudioBuffer;
}

describe("AudioAnalyzerDeck", () => {
  it("offers upload and microphone capture when no audio is loaded", () => {
    render(<AudioAnalyzerDeck onAnalysisComplete={vi.fn()} audioBuffer={null} onClear={vi.fn()} />);

    expect(screen.getByText(/STEP 1: IMPORT AUDIO SOURCE/i)).toBeInTheDocument();
    expect(screen.getByText(/Drag & drop your file here/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /OPEN ACOUSTIC MIC/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Reset Tape/i })).not.toBeInTheDocument();
  });

  it("summarizes a decoded buffer and clears it on request", () => {
    const onClear = vi.fn();
    render(
      <AudioAnalyzerDeck
        onAnalysisComplete={vi.fn()}
        audioBuffer={stubAudioBuffer({ numberOfChannels: 1, length: 96000, sampleRate: 44100 })}
        onClear={onClear}
      />,
    );

    expect(screen.getByText(/Raw Audio Deck Ready/i)).toBeInTheDocument();
    expect(screen.getByText(/1 Channel \/ 96k Samples \/ 44100 Hz/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reset Tape/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("rejects a file that is not audio without calling back", async () => {
    const onAnalysisComplete = vi.fn();
    const { container } = render(
      <AudioAnalyzerDeck
        onAnalysisComplete={onAnalysisComplete}
        audioBuffer={null}
        onClear={vi.fn()}
      />,
    );

    const input = container.querySelector<HTMLInputElement>("#audio-file-input");
    if (!input) throw new Error("file input not rendered");

    const notAudio = new File(["definitely not audio"], "notes.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [notAudio] } });

    expect(await screen.findByText(/Invalid file type/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(onAnalysisComplete).not.toHaveBeenCalled();
    });
  });
});
