import { describe, expect, it } from "vitest";
import { getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
  const fallback = "Something went wrong.";

  it("uses the message of a thrown Error", () => {
    expect(getErrorMessage(new Error("Decode failed"), fallback)).toBe("Decode failed");
  });

  it("uses a thrown string", () => {
    expect(getErrorMessage("Mic unavailable", fallback)).toBe("Mic unavailable");
  });

  it("uses the message of an error-shaped object, such as an API payload", () => {
    expect(getErrorMessage({ message: "429 Too Many Requests" }, fallback)).toBe(
      "429 Too Many Requests",
    );
  });

  it.each([
    ["an empty Error message", new Error("")],
    ["an empty string", ""],
    ["an object with a non-string message", { message: 500 }],
    ["a bare object", {}],
    ["null", null],
    ["undefined", undefined],
  ])("falls back for %s", (_label, thrown) => {
    expect(getErrorMessage(thrown, fallback)).toBe(fallback);
  });
});
