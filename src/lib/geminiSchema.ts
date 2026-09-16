/**
 * Define Gemini structured output JSON schemas for mastering plans and EQ bands.
 */

import { Type } from "@google/genai";

export const EQ_BAND_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    hz: {
      type: Type.INTEGER,
      description: "Center or cutoff frequency in Hz.",
    },
    gain: {
      type: Type.NUMBER,
      description: "Gain in dB, typically between -10 and +10 dB.",
    },
  },
  required: ["hz", "gain"],
};

export const MASTERING_PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    gainDb: {
      type: Type.NUMBER,
      description: "Overall level makeup gain (e.g. +3 or -1 dB). Default is 0.",
    },
    highpassHz: {
      type: Type.INTEGER,
      description:
        "Low-cut high-pass filter frequency in Hz. Suggested range of 20-150Hz. Set to 0 if no mud is present.",
    },
    lowpassHz: {
      type: Type.INTEGER,
      description:
        "High-cut low-pass filter frequency in Hz to clear hiss. Set to 20000 to bypass.",
    },
    eq: {
      type: Type.OBJECT,
      description: "3-band parametric/shelving equalizer settings.",
      properties: {
        bass: {
          ...EQ_BAND_SCHEMA,
          description: "Bass peaking/shelving EQ (typically 80-100Hz).",
        },
        mid: {
          ...EQ_BAND_SCHEMA,
          description: "Midrange peaking EQ (typically 800-2000Hz).",
        },
        treble: {
          ...EQ_BAND_SCHEMA,
          description: "Treble peaking/shelving EQ (typically 8000-12000Hz).",
        },
      },
      required: ["bass", "mid", "treble"],
    },
    compressorThreshold: {
      type: Type.NUMBER,
      description: "Compression threshold in dBFS (e.g., -15 to -35). Default is -20.",
    },
    compressorRatio: {
      type: Type.NUMBER,
      description: "Compression ratio. E.g. 1.5 to 4.0. Set to 1.0 to skip compressing.",
    },
    planDescription: {
      type: Type.STRING,
      description:
        "An encouraging engineer description of exactly how this mastering plan polishes the sound.",
    },
  },
  required: [
    "gainDb",
    "highpassHz",
    "lowpassHz",
    "eq",
    "compressorThreshold",
    "compressorRatio",
    "planDescription",
  ],
};
