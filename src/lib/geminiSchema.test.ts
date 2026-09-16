import { describe, expect, it } from "vitest";
import { DEFAULT_MASTERING_PLAN, MasteringPlanSchema } from "../types";
import { EQ_BAND_SCHEMA, MASTERING_PLAN_SCHEMA } from "./geminiSchema";

describe("geminiSchema", () => {
  it("defines all required mastering plan properties matching MasteringPlanSchema", () => {
    const requiredKeys = MASTERING_PLAN_SCHEMA.required;
    const planKeys = Object.keys(DEFAULT_MASTERING_PLAN);

    for (const key of planKeys) {
      expect(requiredKeys).toContain(key);
    }
  });

  it("requires all 3 EQ bands (bass, mid, treble) in the nested schema", () => {
    const eqProps = MASTERING_PLAN_SCHEMA.properties.eq;
    expect(eqProps.required).toEqual(["bass", "mid", "treble"]);
    expect(eqProps.properties.bass).toMatchObject(EQ_BAND_SCHEMA);
    expect(eqProps.properties.mid).toMatchObject(EQ_BAND_SCHEMA);
    expect(eqProps.properties.treble).toMatchObject(EQ_BAND_SCHEMA);
  });

  it("produces valid default data conforming to Zod schema", () => {
    const parsed = MasteringPlanSchema.safeParse(DEFAULT_MASTERING_PLAN);
    expect(parsed.success).toBe(true);
  });
});
