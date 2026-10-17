import { describe, expect, it } from "vitest";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE, APP_TITLE, APP_WORKSPACE_ID } from "./constants";

describe("Application Constants", () => {
  it("defines consistent branding and workspace configuration", () => {
    expect(APP_NAME).toBe("AI Audio Engineer");
    expect(APP_TAGLINE).toBe("Audio Mastering Studio");
    expect(APP_TITLE).toBe("AI Audio Engineer - Audio Mastering Studio");
    expect(APP_WORKSPACE_ID).toBe("audio-engineer-workspace");
    expect(APP_DESCRIPTION).toContain("Gemini");
  });
});
