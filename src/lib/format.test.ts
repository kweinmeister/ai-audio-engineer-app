import { describe, expect, it } from "vitest";
import { formatBytes, formatSecs } from "./format";

describe("formatSecs", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [9.9, "0:09"],
    [59, "0:59"],
    [60, "1:00"],
    [61.4, "1:01"],
    [3599, "59:59"],
    [3600, "60:00"],
  ])("formats %s seconds as %s", (input, expected) => {
    expect(formatSecs(input)).toBe(expected);
  });

  it.each([
    [-12, "0:00"],
    [Number.NaN, "0:00"],
    [Number.POSITIVE_INFINITY, "0:00"],
  ])("clamps the unusable input %s to 0:00", (input) => {
    expect(formatSecs(input)).toBe("0:00");
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 Bytes"],
    [1, "1 Bytes"],
    [1023, "1023 Bytes"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [1024 * 1024, "1 MB"],
    [15 * 1024 * 1024, "15 MB"],
  ])("formats %s bytes as %s", (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });

  it("rounds to at most two decimal places", () => {
    expect(formatBytes(1234567)).toBe("1.18 MB");
  });

  it("caps the unit at MB rather than emitting an undefined unit", () => {
    expect(formatBytes(5 * 1024 ** 3)).toBe("5120 MB");
  });
});
