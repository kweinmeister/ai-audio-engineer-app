/**
 * Provide client networking functions for communicating with backend Gemini audio analysis
 * and mastering refinement endpoints, validated with Zod schemas.
 */

import {
  type AnalyzeResponse,
  AnalyzeResponseSchema,
  type AppConfig,
  AppConfigSchema,
  type AudioCritique,
  type AudioFeatures,
  DEFAULT_GEMINI_MODEL,
  type MasteringPlan,
  type RefineResponse,
  RefineResponseSchema,
} from "../types";
import { getErrorMessage } from "./errors";

/**
 * Fetch server runtime configuration including the active Gemini model identifier.
 */
export async function fetchAppConfig(): Promise<AppConfig> {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      return { model: DEFAULT_GEMINI_MODEL };
    }
    const rawJson = await response.json();
    return AppConfigSchema.parse(rawJson);
  } catch {
    return { model: DEFAULT_GEMINI_MODEL };
  }
}

/**
 * Send audio feature statistics and optional audio data to the backend analysis route.
 */
export async function analyzeAudio(
  features: AudioFeatures,
  base64Audio?: string,
  mimeType?: string,
): Promise<AnalyzeResponse> {
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        features,
        base64Audio,
        mimeType,
      }),
    });

    if (!response.ok) {
      let errorMessage = "Analysis server error.";
      try {
        const errData = await response.json();
        if (errData?.error) {
          errorMessage = errData.error;
        }
      } catch (_jsonErr) {
        // Fall back to default message if JSON parsing fails
      }
      throw new Error(errorMessage);
    }

    const rawJson = await response.json();
    return AnalyzeResponseSchema.parse(rawJson);
  } catch (error) {
    throw new Error(getErrorMessage(error, "Analysis server error."));
  }
}

/**
 * Send current mastering settings and natural-language user instructions to refine parameters.
 */
export async function refineMasteringPlan(
  currentPlan: MasteringPlan,
  userFeedback: string,
  critique?: AudioCritique | null,
): Promise<RefineResponse> {
  try {
    const response = await fetch("/api/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPlan,
        userFeedback,
        critique: critique ?? undefined,
      }),
    });

    if (!response.ok) {
      let errorMessage = "Refinement server error.";
      try {
        const errData = await response.json();
        if (errData?.error) {
          errorMessage = errData.error;
        }
      } catch (_jsonErr) {
        // Fall back to default message
      }
      throw new Error(errorMessage);
    }

    const rawJson = await response.json();
    return RefineResponseSchema.parse(rawJson);
  } catch (error) {
    throw new Error(getErrorMessage(error, "Refinement server error."));
  }
}
