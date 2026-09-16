/**
 * Define domain entities, API response schemas, and state representations
 * for audio engineering analysis and mastering using Zod for runtime verification.
 */

import { z } from "zod";

export const AudioFeaturesSchema = z.object({
  duration: z.number().nonnegative(),
  sampleRate: z.number().positive(),
  maxVolumeDb: z.number(),
  avgVolumeDb: z.number(),
  estimatedNoiseFloorDb: z.number(),
  clippingDetected: z.boolean(),
  frequencyPeaks: z.array(z.number()),
  fileName: z.string(),
  fileSize: z.number().nonnegative(),
  mimeType: z.string(),
});
export type AudioFeatures = z.infer<typeof AudioFeaturesSchema>;

export const AudioCritiqueSchema = z.object({
  hiss: z.string(),
  hum: z.string(),
  clipping: z.string(),
  dynamicRange: z.string(),
  generalComments: z.string(),
});
export type AudioCritique = z.infer<typeof AudioCritiqueSchema>;

export const EqBandSchema = z.object({
  /** Frequency in Hz (audible human spectrum 20 Hz - 22 kHz; 80 Hz bass, 1 kHz mid, 10 kHz treble). */
  hz: z.number().min(20).max(22000),
  /** Gain adjustment in dB (standard mastering bell range ±18 dB; subtle moves ±1 to ±4 dB). */
  gain: z.number().min(-18).max(18),
});
export type EqBand = z.infer<typeof EqBandSchema>;

export const MasteringPlanSchema = z.object({
  /** Pre-amp / makeup gain in dB (±24 dB range; standard console fader ±12 dB). */
  gainDb: z.number().min(-24).max(24),
  /** Highpass cutoff in Hz (sub-rumble 20-40 Hz, vocal plosives 60-100 Hz; 0 Hz bypasses). */
  highpassHz: z.number().min(0).max(500),
  /** Lowpass cutoff in Hz (tape hiss / RF cut 14-18 kHz; >= 20000 Hz bypasses). */
  lowpassHz: z.number().min(1000).max(22000),
  eq: z.object({
    bass: EqBandSchema,
    mid: EqBandSchema,
    treble: EqBandSchema,
  }),
  /** Compressor threshold in dBFS (-60 to 0 dBFS; typical mastering bus -30 to -6 dBFS). */
  compressorThreshold: z.number().min(-60).max(0),
  /** Compressor ratio (1.0 to 20.0; 1.0:1 is bypass, 1.2:1-2.5:1 is mastering glue, >10:1 is limiting). */
  compressorRatio: z.number().min(1.0).max(20.0),
  planDescription: z.string(),
});
export type MasteringPlan = z.infer<typeof MasteringPlanSchema>;

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export const AppConfigSchema = z.object({
  model: z.string().min(1),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export const AnalyzeResponseSchema = z.object({
  score: z.number().min(0).max(100),
  critique: AudioCritiqueSchema,
  masteringPlan: MasteringPlanSchema,
  reportMarkdown: z.string(),
  model: z.string().optional(),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

export const RefineResponseSchema = z.object({
  masteringPlan: MasteringPlanSchema,
});
export type RefineResponse = z.infer<typeof RefineResponseSchema>;

export const AnalyzeRequestSchema = z.object({
  features: AudioFeaturesSchema,
  base64Audio: z.string().optional(),
  mimeType: z.string().optional(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

export const RefineRequestSchema = z.object({
  currentPlan: MasteringPlanSchema,
  userFeedback: z.string().min(1, "User feedback cannot be empty"),
  critique: AudioCritiqueSchema.optional().nullable(),
});
export type RefineRequest = z.infer<typeof RefineRequestSchema>;

export interface AsyncStatus {
  loading: boolean;
  error: string | null;
}

export const DEFAULT_MASTERING_PLAN: MasteringPlan = {
  gainDb: 0,
  highpassHz: 0,
  lowpassHz: 20000,
  eq: {
    bass: { hz: 80, gain: 0 },
    mid: { hz: 1000, gain: 0 },
    treble: { hz: 10000, gain: 0 },
  },
  compressorThreshold: -20,
  compressorRatio: 1.0,
  planDescription:
    "Neutral flat reference mastering scheme. Bypass is currently active or no corrective coefficients are calculated yet.",
};
