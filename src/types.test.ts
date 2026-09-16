import { describe, expect, it } from "vitest";
import {
  AnalyzeRequestSchema,
  AnalyzeResponseSchema,
  AppConfigSchema,
  AudioFeaturesSchema,
  DEFAULT_MASTERING_PLAN,
  MasteringPlanSchema,
  RefineRequestSchema,
} from "./types";

describe("Zod validation schemas", () => {
  const validFeatures = {
    duration: 15.5,
    sampleRate: 44100,
    maxVolumeDb: -3.0,
    avgVolumeDb: -18.0,
    estimatedNoiseFloorDb: -55.0,
    clippingDetected: false,
    frequencyPeaks: [120, 2500],
    fileName: "vocal.wav",
    fileSize: 1024,
    mimeType: "audio/wav",
  };

  const validCritique = {
    hiss: "Minimal tape hiss.",
    hum: "No hum.",
    clipping: "Clean.",
    dynamicRange: "Stable.",
    generalComments: "Good capture.",
  };

  describe("MasteringPlanSchema", () => {
    it("successfully parses default mastering plan", () => {
      const parsed = MasteringPlanSchema.safeParse(DEFAULT_MASTERING_PLAN);
      expect(parsed.success).toBe(true);
    });

    it("rejects when nested eq band is missing", () => {
      const invalid = {
        ...DEFAULT_MASTERING_PLAN,
        eq: {
          bass: { hz: 80, gain: 0 },
          // mid is missing
          treble: { hz: 10000, gain: 0 },
        },
      };
      const parsed = MasteringPlanSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });

    it("rejects non-physical audio frequencies and extreme gains", () => {
      // Negative EQ frequency
      const invalidFreq = {
        ...DEFAULT_MASTERING_PLAN,
        eq: {
          ...DEFAULT_MASTERING_PLAN.eq,
          bass: { hz: -50, gain: 0 },
        },
      };
      expect(MasteringPlanSchema.safeParse(invalidFreq).success).toBe(false);

      // Excessive gain (+40 dB)
      const invalidGain = {
        ...DEFAULT_MASTERING_PLAN,
        gainDb: 40,
      };
      expect(MasteringPlanSchema.safeParse(invalidGain).success).toBe(false);

      // Invalid compressor ratio below 1.0
      const invalidRatio = {
        ...DEFAULT_MASTERING_PLAN,
        compressorRatio: 0.5,
      };
      expect(MasteringPlanSchema.safeParse(invalidRatio).success).toBe(false);

      // Invalid positive compressor threshold (> 0 dBFS)
      const invalidThreshold = {
        ...DEFAULT_MASTERING_PLAN,
        compressorThreshold: 10,
      };
      expect(MasteringPlanSchema.safeParse(invalidThreshold).success).toBe(false);
    });
  });

  describe("AnalyzeResponseSchema", () => {
    it("successfully parses complete valid analysis response", () => {
      const validResponse = {
        score: 85,
        critique: validCritique,
        masteringPlan: DEFAULT_MASTERING_PLAN,
        reportMarkdown: "# Acoustic Analysis",
      };
      const parsed = AnalyzeResponseSchema.safeParse(validResponse);
      expect(parsed.success).toBe(true);
    });

    it("rejects score out of range", () => {
      const invalidResponse = {
        score: 150, // exceeds max 100
        critique: validCritique,
        masteringPlan: DEFAULT_MASTERING_PLAN,
        reportMarkdown: "# Report",
      };
      const parsed = AnalyzeResponseSchema.safeParse(invalidResponse);
      expect(parsed.success).toBe(false);
    });
  });

  describe("AnalyzeRequestSchema", () => {
    it("parses valid analyze request", () => {
      const parsed = AnalyzeRequestSchema.safeParse({
        features: validFeatures,
        base64Audio: "abc",
        mimeType: "audio/wav",
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects when features are missing", () => {
      const parsed = AnalyzeRequestSchema.safeParse({});
      expect(parsed.success).toBe(false);
    });
  });

  describe("RefineRequestSchema", () => {
    it("parses valid refine request", () => {
      const parsed = RefineRequestSchema.safeParse({
        currentPlan: DEFAULT_MASTERING_PLAN,
        userFeedback: "More bass please",
        critique: validCritique,
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects empty user feedback string", () => {
      const parsed = RefineRequestSchema.safeParse({
        currentPlan: DEFAULT_MASTERING_PLAN,
        userFeedback: "",
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe("AudioFeaturesSchema", () => {
    it("rejects negative duration", () => {
      const invalid = {
        ...validFeatures,
        duration: -1,
      };
      const parsed = AudioFeaturesSchema.safeParse(invalid);
      expect(parsed.success).toBe(false);
    });
  });

  describe("AppConfigSchema", () => {
    it("validates config with model string", () => {
      const parsed = AppConfigSchema.safeParse({ model: "gemini-3.8-flash" });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.model).toBe("gemini-3.8-flash");
      }
    });

    it("rejects empty model string", () => {
      const parsed = AppConfigSchema.safeParse({ model: "" });
      expect(parsed.success).toBe(false);
    });
  });

  describe("AnalyzeResponseSchema with model", () => {
    it("parses response with optional model included", () => {
      const parsed = AnalyzeResponseSchema.safeParse({
        score: 85,
        critique: validCritique,
        masteringPlan: DEFAULT_MASTERING_PLAN,
        reportMarkdown: "# Report",
        model: "gemini-3.8-flash",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.model).toBe("gemini-3.8-flash");
      }
    });
  });
});
