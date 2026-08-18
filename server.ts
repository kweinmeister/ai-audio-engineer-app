import path from "node:path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import express, { type Request, type Response } from "express";
import { createServer as createViteServer } from "vite";

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set limits large enough for base64 sound payloads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Analyze route
  app.post("/api/analyze", async (req: Request, res: Response) => {
    try {
      const { features, base64Audio, mimeType } = req.body;

      if (!features) {
        return res.status(400).json({ error: "No audio key characteristics / features supplied." });
      }

      console.log(`Analyzing audio file: ${features.fileName} (${features.fileSize} bytes)`);

      // Assemble content parts
      const parts: any[] = [];

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

TASK:
1. Provide a professional assessment score (0-100) reflecting recording quality (background noise, mic proximity, frequency balance).
2. Critique key acoustic items: high-frequency noise (hiss), low-frequency resonance/sub hum (hum), saturation (clipping), volume stability (dynamic range), and raw room comments.
3. Design a targeted corrective Mastering Plan containing precise Web Audio API DSP parameters to clean, boost, and polish this audio.
4. Provide a beautifully written Markdown Report summarizing findings and explains how the mastering chain solves the issues.`,
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
          masteringPlan: {
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
              eqBassHz: {
                type: Type.INTEGER,
                description: "Center frequency for bass peaking/shelving EQ. E.g., 80 or 100.",
              },
              eqBassGain: {
                type: Type.NUMBER,
                description: "Bass EQ gain in dB. Limit range from -10 to +10.",
              },
              eqMidHz: {
                type: Type.INTEGER,
                description: "Center frequency for vocal/mud peaking EQ (typically 800-2000Hz).",
              },
              eqMidGain: {
                type: Type.NUMBER,
                description: "Mid EQ gain in dB. Limit range from -10 to +10.",
              },
              eqTrebleHz: {
                type: Type.INTEGER,
                description:
                  "Center frequency for treble peaking/shelving EQ. E.g., 8000 or 12000.",
              },
              eqTrebleGain: {
                type: Type.NUMBER,
                description: "Treble EQ gain in dB. Limit range from -10 to +10.",
              },
              compressorThreshold: {
                type: Type.NUMBER,
                description: "Compression threshold in dBFS (e.g., -15 to -35). Default is -20.",
              },
              compressorRatio: {
                type: Type.NUMBER,
                description: "Compression ratio. E.g. 1.5 to 4.0. Set to 1.0 to skip compressing.",
              },
              verbDescription: {
                type: Type.STRING,
                description:
                  "An encouraging engineer description of exactly how this mastering plan polishes the sound.",
              },
            },
            required: [
              "gainDb",
              "highpassHz",
              "lowpassHz",
              "eqBassHz",
              "eqBassGain",
              "eqMidHz",
              "eqMidGain",
              "eqTrebleHz",
              "eqTrebleGain",
              "compressorThreshold",
              "compressorRatio",
              "verbDescription",
            ],
          },
          reportMarkdown: {
            type: Type.STRING,
            description: "Comprehensive client report explaining technical findings.",
          },
        },
        required: ["score", "critique", "masteringPlan", "reportMarkdown"],
      };

      const result = await ai.models.generateContent({
        model: "gemini-3.7-flash",
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
      res.json(cleanJson);
    } catch (error: any) {
      console.error("Gemini audio analysis error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to process audio analysis via Gemini." });
    }
  });

  // API Refine route
  app.post("/api/refine", async (req: Request, res: Response) => {
    try {
      const { currentPlan, userFeedback, critique } = req.body;

      if (!currentPlan || !userFeedback) {
        return res.status(400).json({ error: "Missing current plan or user feedback to refine." });
      }

      console.log(`Refining mastering plan based on feedback: "${userFeedback}"`);

      const prompt = `You are an expert Audio Mastering and Mixing Engineer.
We want to adjust our current Web Audio API DSP mastering plan parameters according to custom user instructions.

Current Mastering Parameters:
- Volume Makeup Gain: ${currentPlan.gainDb} dB
- High-Pass Filter (Low Cut): ${currentPlan.highpassHz} Hz
- Low-Pass Filter (High Cut): ${currentPlan.lowpassHz} Hz
- Bass EQ Freq: ${currentPlan.eqBassHz} Hz, Gain: ${currentPlan.eqBassGain} dB
- Midrange EQ Freq: ${currentPlan.eqMidHz} Hz, Gain: ${currentPlan.eqMidGain} dB
- Treble EQ Freq: ${currentPlan.eqTrebleHz} Hz, Gain: ${currentPlan.eqTrebleGain} dB
- Compressor Threshold: ${currentPlan.compressorThreshold} dB, Ratio: ${currentPlan.compressorRatio}
- Current explanation: ${currentPlan.verbDescription}

${critique ? `Initial acoustic findings:\n- Hiss: ${critique.hiss}\n- Hum: ${critique.hum}\n- Dynamic Range: ${critique.dynamicRange}` : ""}

User Adjustment Instructions:
"${userFeedback}"

TASK:
Recalculate the parameters to perfectly accommodate the user's feedback.
- If they ask for "more warm/bassy", boost the eqBassGain and/or lower the lowpassHz slightly.
- If they ask for "cleaner", check hum/hiss and adjust filters.
- If they ask for "louder", boost gainDb or compress more.
- Set appropriate dB limits (EQ gains between -10dB and +10dB, gainDb between -12dB and +12dB).
- Return the updated mastering plan parameters along with a refined explanation summarizing these changes.`;

      const refineResponseSchema = {
        type: Type.OBJECT,
        properties: {
          masteringPlan: {
            type: Type.OBJECT,
            properties: {
              gainDb: { type: Type.NUMBER },
              highpassHz: { type: Type.INTEGER },
              lowpassHz: { type: Type.INTEGER },
              eqBassHz: { type: Type.INTEGER },
              eqBassGain: { type: Type.NUMBER },
              eqMidHz: { type: Type.INTEGER },
              eqMidGain: { type: Type.NUMBER },
              eqTrebleHz: { type: Type.INTEGER },
              eqTrebleGain: { type: Type.NUMBER },
              compressorThreshold: { type: Type.NUMBER },
              compressorRatio: { type: Type.NUMBER },
              verbDescription: { type: Type.STRING },
            },
            required: [
              "gainDb",
              "highpassHz",
              "lowpassHz",
              "eqBassHz",
              "eqBassGain",
              "eqMidHz",
              "eqMidGain",
              "eqTrebleHz",
              "eqTrebleGain",
              "compressorThreshold",
              "compressorRatio",
              "verbDescription",
            ],
          },
        },
        required: ["masteringPlan"],
      };

      const result = await ai.models.generateContent({
        model: "gemini-3.7-flash",
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
      res.json(cleanJson);
    } catch (error: any) {
      console.error("Gemini refinement error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to refine mastering plan via Gemini." });
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
