import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AnalyzeResponse,
  type AudioCritique,
  type AudioFeatures,
  DEFAULT_GEMINI_MODEL,
  type MasteringPlan,
  type RefineResponse,
} from "../types";
import { analyzeAudio, fetchAppConfig, refineMasteringPlan } from "./api";

const mockFeatures: AudioFeatures = {
  duration: 12.5,
  sampleRate: 44100,
  maxVolumeDb: -3.2,
  avgVolumeDb: -18.4,
  estimatedNoiseFloorDb: -55.0,
  clippingDetected: false,
  frequencyPeaks: [120, 1500, 8000],
  fileName: "vocal_track.wav",
  fileSize: 1048576,
  mimeType: "audio/wav",
};

const mockMasteringPlan: MasteringPlan = {
  gainDb: 1.5,
  highpassHz: 40,
  lowpassHz: 18000,
  eq: {
    bass: { hz: 100, gain: 1.0 },
    mid: { hz: 1200, gain: -1.5 },
    treble: { hz: 10000, gain: 2.0 },
  },
  compressorThreshold: -18,
  compressorRatio: 2.5,
  planDescription: "Subtle low cut and gentle vocal presence boost.",
};

const mockCritique: AudioCritique = {
  hiss: "Minimal background tape hiss.",
  hum: "No electrical hum detected.",
  clipping: "Clean transient peaks.",
  dynamicRange: "Natural expressive vocal dynamics.",
  generalComments: "High quality acoustic capture.",
};

const mockAnalyzeResponse: AnalyzeResponse = {
  score: 88,
  critique: mockCritique,
  masteringPlan: mockMasteringPlan,
  reportMarkdown: "# Acoustic Analysis\nOverall quality is good.",
};

const mockRefineResponse: RefineResponse = {
  masteringPlan: mockMasteringPlan,
};

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("analyzeAudio", () => {
    it("sends audio features and returns parsed response on success", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockAnalyzeResponse,
      } as Response);

      const result = await analyzeAudio(mockFeatures, "base64-data", "audio/wav");

      expect(mockFetch).toHaveBeenCalledWith("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          features: mockFeatures,
          base64Audio: "base64-data",
          mimeType: "audio/wav",
        }),
      });
      expect(result).toEqual(mockAnalyzeResponse);
    });

    it("throws a validation error when the server returns malformed schema data", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          score: "not-a-number",
          critique: {},
        }),
      } as unknown as Response);

      await expect(analyzeAudio(mockFeatures)).rejects.toThrow();
    });

    it("throws an error when the server returns a non-ok response with error JSON", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Audio file too large or unsupported format" }),
      } as Response);

      await expect(analyzeAudio(mockFeatures)).rejects.toThrow(
        "Audio file too large or unsupported format",
      );
    });

    it("throws a fallback error when the server returns a non-ok response without error field", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      } as Response);

      await expect(analyzeAudio(mockFeatures)).rejects.toThrow("Analysis server error.");
    });

    it("throws a fallback error when network failure occurs", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockRejectedValueOnce(new Error("Network connection dropped"));

      await expect(analyzeAudio(mockFeatures)).rejects.toThrow("Network connection dropped");
    });
  });

  describe("refineMasteringPlan", () => {
    it("sends current plan and feedback, returning validated refine response", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRefineResponse,
      } as Response);

      const result = await refineMasteringPlan(
        mockMasteringPlan,
        "Make the high frequencies warmer",
        mockCritique,
      );

      expect(mockFetch).toHaveBeenCalledWith("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPlan: mockMasteringPlan,
          userFeedback: "Make the high frequencies warmer",
          critique: mockCritique,
        }),
      });
      expect(result).toEqual(mockRefineResponse);
    });

    it("throws error when refine endpoint returns error JSON", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Failed to refine mastering plan via Gemini." }),
      } as Response);

      await expect(refineMasteringPlan(mockMasteringPlan, "Add more bass")).rejects.toThrow(
        "Failed to refine mastering plan via Gemini.",
      );
    });

    it("throws error when refine response contains invalid plan schema", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          masteringPlan: {
            gainDb: "invalid-gain",
          },
        }),
      } as unknown as Response);

      await expect(refineMasteringPlan(mockMasteringPlan, "Add more bass")).rejects.toThrow();
    });
  });

  describe("fetchAppConfig", () => {
    it("returns parsed server configuration", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ model: "gemini-3.8-flash" }),
      } as Response);

      const config = await fetchAppConfig();
      expect(mockFetch).toHaveBeenCalledWith("/api/config");
      expect(config).toEqual({ model: "gemini-3.8-flash" });
    });

    it("falls back to DEFAULT_GEMINI_MODEL when endpoint fails", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
      } as Response);

      const config = await fetchAppConfig();
      expect(config).toEqual({ model: DEFAULT_GEMINI_MODEL });
    });

    it("falls back to DEFAULT_GEMINI_MODEL on network exception", async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockRejectedValueOnce(new Error("Network failure"));

      const config = await fetchAppConfig();
      expect(config).toEqual({ model: DEFAULT_GEMINI_MODEL });
    });
  });
});
