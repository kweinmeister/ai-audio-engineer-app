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

    expect(screen.getByText(/ACTIVE AUDIO SOURCE/i)).toBeInTheDocument();
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

  it("does not render Reset Tape button when onClear is not provided", () => {
    render(<AudioAnalyzerDeck onAnalysisComplete={vi.fn()} audioBuffer={stubAudioBuffer()} />);
    expect(screen.queryByRole("button", { name: /Reset Tape/i })).not.toBeInTheDocument();
  });

  it("resets file input value to allow re-uploading the same file", async () => {
    const { container } = render(
      <AudioAnalyzerDeck onAnalysisComplete={vi.fn()} audioBuffer={null} />,
    );

    const input = container.querySelector<HTMLInputElement>("#audio-file-input");
    if (!input) throw new Error("file input not rendered");

    const notAudio = new File(["not audio"], "test.txt", { type: "text/plain" });
    Object.defineProperty(input, "value", {
      writable: true,
      value: "C:\\fakepath\\test.txt",
    });

    fireEvent.change(input, { target: { files: [notAudio] } });
    expect(input.value).toBe("");
  });

  it("cleans up microphone tracks when unmounting during active recording", async () => {
    const stopTrackMock = vi.fn();
    const mockTrack = { stop: stopTrackMock } as unknown as MediaStreamTrack;
    const mockStream = {
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
      writable: true,
    });

    class MockMediaRecorder {
      state = "recording";
      start = vi.fn();
      stop = vi.fn();
      ondataavailable = null;
      onstop = null;
      static isTypeSupported = vi.fn().mockReturnValue(true);
    }
    window.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder;

    const { unmount } = render(
      <AudioAnalyzerDeck onAnalysisComplete={vi.fn()} audioBuffer={null} />,
    );

    const recordBtn = screen.getByRole("button", { name: /OPEN ACOUSTIC MIC/i });
    fireEvent.click(recordBtn);

    await waitFor(() => {
      expect(screen.getByText(/RECORDING RAW AUDIO/i)).toBeInTheDocument();
    });

    unmount();

    expect(stopTrackMock).toHaveBeenCalledTimes(1);
  });
});
