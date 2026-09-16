import path from "node:path";
import { GoogleGenAI, type Part, Type } from "@google/genai";
import dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import { createServer as createViteServer } from "vite";
import { getErrorMessage } from "./src/lib/errors";
import {
  AnalyzeRequestSchema,
  AnalyzeResponseSchema,
  RefineRequestSchema,
  RefineResponseSchema,
} from "./src/types";

dotenv.config();

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

import { MASTERING_PLAN_SCHEMA } from "./src/lib/geminiSchema";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set limits large enough for base64 sound payloads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Config route: Expose dynamic server runtime configuration
  app.get("/api/config", (_req: Request, res: Response) => {
    res.json({ model: GEMINI_MODEL });
  });

  // API Analyze route
  app.post("/api/analyze", async (req: Request, res: Response) => {
    try {
      const parsedRequest = AnalyzeRequestSchema.safeParse(req.body);
      if (!parsedRequest.success) {
        return res.status(400).json({
          error: "Invalid audio analysis request payload.",
          details: parsedRequest.error.flatten(),
        });
      }

      const { features, base64Audio, mimeType } = parsedRequest.data;
      console.log(`Analyzing audio file: ${features.fileName} (${features.fileSize} bytes)`);

      // Assemble content parts
      const parts: Part[] = [];

      // If we got raw audio as base64, include it so Gemini can naturally review / hear sound problems
      if (base64Audio && mimeType) {
        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Audio,
          },
        });
      }

      // Add detailed analytical instruction
      parts.push({
        text: `You are an expert Audio Mastering and Mixing Engineer operating a professional acoustic diagnostic suite.
Analyze this recording and return an accurate critique and correctional mastering plan.

Here are the audio statistical measurements analyzed from the reader engine:
- Filename: ${features.fileName}
- Duration: ${features.duration.toFixed(2)} seconds
- Sample Rate: ${features.sampleRate} Hz
- Peak Amplitude (Volume): ${features.maxVolumeDb.toFixed(2)} dBFS
- Average Loudness (Volume): ${features.avgVolumeDb.toFixed(2)} dBFS
- Extracted Noise Floor: ${features.estimatedNoiseFloorDb.toFixed(2)} dBFS
- Digital Clipping Detected: ${features.clippingDetected ? "YES" : "NO"}
- Sensed Frequency Peak Bands: ${features.frequencyPeaks.join(", ")} Hz

TARGET INDUSTRY STANDARDS:
- Streaming Music (Spotify, YouTube, Tidal): Target ~ -14 LUFS with -1.0 dBFS True Peak ceiling.
- Podcasts & Spoken Word (AES TD1004 / Apple Podcasts): Target -16 LUFS (stereo) / -19 LUFS (mono), highpass low-cut at 60-100 Hz.
- Broadcast Delivery (EBU R128): Target -23 LUFS.
- Mastering EQ: Prioritize gentle, broad musical moves (typically ±1 to ±4 dB; up to ±8 dB for corrective recovery).
- Dynamics: Prioritize transparent leveling (ratio 1.5:1 to 3:1, threshold -15 to -30 dBFS).

TASK:
1. Provide a professional assessment score (0-100) reflecting recording quality (background noise, mic proximity, frequency balance).
2. Critique key acoustic items: high-frequency noise (hiss), low-frequency resonance/sub hum (hum), saturation (clipping), volume stability (dynamic range), and raw room comments.
3. Design a targeted corrective Mastering Plan containing precise Web Audio API DSP parameters to clean, boost, and polish this audio.
4. Provide a beautifully written Markdown Report summarizing findings and explains how the mastering chain solves the issues. Format with markdown headings (###), bullet points (- ), and numbered lists (1. ). Write in natural, professional sentence case (do NOT write in ALL CAPS or emit literal escaped sequences like \\N).`,
      });

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          score: {
            type: Type.INTEGER,
            description:
              "Audio Quality Score from 0 (very poor) to 100 (professional studio level).",
          },
          critique: {
            type: Type.OBJECT,
            properties: {
              hiss: { type: Type.STRING, description: "Analysis of high frequency noise/hiss." },
              hum: {
                type: Type.STRING,
                description: "Analysis of low frequency rumbling or humming.",
              },
              clipping: {
                type: Type.STRING,
                description: "Analysis of clipping, distortion, or oversaturation levels.",
              },
              dynamicRange: {
                type: Type.STRING,
                description: "Analysis of dynamics, consistency, and volume variance.",
              },
              generalComments: {
                type: Type.STRING,
                description: "General summary comments about raw recording context and gear.",
              },
            },
            required: ["hiss", "hum", "clipping", "dynamicRange", "generalComments"],
          },
          masteringPlan: MASTERING_PLAN_SCHEMA,
          reportMarkdown: {
            type: Type.STRING,
            description: "Comprehensive client report explaining technical findings.",
          },
        },
        required: ["score", "critique", "masteringPlan", "reportMarkdown"],
      };

      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: parts,
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });

      if (!result.text) {
        throw new Error("No diagnostic response generated from Gemini API.");
      }

      const cleanJson = JSON.parse(result.text.trim());
      const validatedResponse = AnalyzeResponseSchema.parse({
        ...cleanJson,
        model: GEMINI_MODEL,
      });
      res.json(validatedResponse);
    } catch (error) {
      console.error("Gemini audio analysis error:", error);
      res.status(500).json({
        error: getErrorMessage(error, "Failed to process audio analysis via Gemini."),
      });
    }
  });

  // API Refine route
  app.post("/api/refine", async (req: Request, res: Response) => {
    try {
      const parsedRequest = RefineRequestSchema.safeParse(req.body);
      if (!parsedRequest.success) {
        return res.status(400).json({
          error: "Invalid mastering refinement request payload.",
          details: parsedRequest.error.flatten(),
        });
      }

      const { currentPlan, userFeedback, critique } = parsedRequest.data;
      console.log(`Refining mastering plan based on feedback: "${userFeedback}"`);

      const prompt = `You are an expert Audio Mastering and Mixing Engineer.
We want to adjust our current Web Audio API DSP mastering plan parameters according to custom user instructions.

Current Mastering Parameters:
- Volume Makeup Gain: ${currentPlan.gainDb} dB
- High-Pass Filter (Low Cut): ${currentPlan.highpassHz} Hz
- Low-Pass Filter (High Cut): ${currentPlan.lowpassHz} Hz
- Bass EQ: ${currentPlan.eq.bass.hz} Hz, Gain: ${currentPlan.eq.bass.gain} dB
- Midrange EQ: ${currentPlan.eq.mid.hz} Hz, Gain: ${currentPlan.eq.mid.gain} dB
- Treble EQ: ${currentPlan.eq.treble.hz} Hz, Gain: ${currentPlan.eq.treble.gain} dB
- Compressor Threshold: ${currentPlan.compressorThreshold} dB, Ratio: ${currentPlan.compressorRatio}
- Current explanation: ${currentPlan.planDescription}

${critique ? `Initial acoustic findings:\n- Hiss: ${critique.hiss}\n- Hum: ${critique.hum}\n- Dynamic Range: ${critique.dynamicRange}` : ""}

User Adjustment Instructions:
"${userFeedback}"

TASK:
Recalculate the parameters to perfectly accommodate the user's feedback.
- If they ask for "more warm/bassy", boost the eq.bass.gain and/or lower the lowpassHz slightly.
- If they ask for "cleaner", check hum/hiss and adjust filters.
- If they ask for "louder", boost gainDb or compress more.
- Set appropriate dB limits (EQ gains between -10dB and +10dB, gainDb between -12dB and +12dB).
- Return the updated mastering plan parameters along with a refined explanation summarizing these changes.`;

      const refineResponseSchema = {
        type: Type.OBJECT,
        properties: {
          masteringPlan: MASTERING_PLAN_SCHEMA,
        },
        required: ["masteringPlan"],
      };

      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: refineResponseSchema,
        },
      });

      if (!result.text) {
        throw new Error("No refinement response generated from Gemini API.");
      }

      const cleanJson = JSON.parse(result.text.trim());
      const validatedResponse = RefineResponseSchema.parse(cleanJson);
      res.json(validatedResponse);
    } catch (error) {
      console.error("Gemini refinement error:", error);
      res.status(500).json({
        error: getErrorMessage(error, "Failed to refine mastering plan via Gemini."),
      });
    }
  });

  // Client-Side setup (express static in production, vite in development)
  if (process.env.NODE_ENV !== "production") {
    console.log("Setting up Vite dev server middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving production static built assets...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening at http://localhost:${PORT}`);
  });
}

startServer();
