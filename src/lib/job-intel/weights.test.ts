import { describe, expect, it } from "vitest";

import { DEFAULT_WEIGHTS, WEIGHTS_SETTING_KEY, weightedScore, weightsSchema, type DimensionScores, type Weights } from "./weights";

const dimensions = (score: number): DimensionScores => ({
  technicalSkills: score,
  relevantExperience: score,
  responsibilities: score,
  architecture: score,
  seniority: score,
  domain: score,
  locationRemote: score,
  employmentConditions: score,
});

describe("DEFAULT_WEIGHTS", () => {
  it("is the master.md §3.2 table", () => {
    expect(DEFAULT_WEIGHTS).toEqual({
      technicalSkills: 25,
      relevantExperience: 20,
      responsibilities: 15,
      architecture: 10,
      seniority: 10,
      domain: 5,
      locationRemote: 10,
      employmentConditions: 5,
    });
  });

  it("validates under the stored-weights schema, so the defaults always load", () => {
    expect(weightsSchema.safeParse(DEFAULT_WEIGHTS).success).toBe(true);
  });
});

describe("weightsSchema", () => {
  it("accepts any eight weights that add up to exactly 100", () => {
    const even: Weights = { technicalSkills: 12.5, relevantExperience: 12.5, responsibilities: 12.5, architecture: 12.5, seniority: 12.5, domain: 12.5, locationRemote: 12.5, employmentConditions: 12.5 };
    expect(weightsSchema.safeParse(even).success).toBe(true);
  });

  it.each([
    ["99", { ...DEFAULT_WEIGHTS, domain: 4 }],
    ["101", { ...DEFAULT_WEIGHTS, domain: 6 }],
    ["a missing dimension", { technicalSkills: 100 }],
    ["a score over 100", { ...DEFAULT_WEIGHTS, technicalSkills: 125 }],
    ["an unknown dimension", { ...DEFAULT_WEIGHTS, leadership: 10 } as Weights],
  ])("rejects %s", (_name, weights) => {
    expect(weightsSchema.safeParse(weights).success).toBe(false);
  });
});

describe("weightedScore", () => {
  it("keeps a level score level under the default weights", () => {
    expect(weightedScore(dimensions(80), DEFAULT_WEIGHTS)).toBe(80);
  });

  it("weights each dimension, out of 100", () => {
    const scores: DimensionScores = { ...dimensions(0), technicalSkills: 100 };
    expect(weightedScore(scores, DEFAULT_WEIGHTS)).toBe(25);
  });

  it("rounds to a whole number", () => {
    const scores: DimensionScores = { ...dimensions(0), technicalSkills: 55 };
    expect(weightedScore(scores, DEFAULT_WEIGHTS)).toBe(14);
  });

  it("follows custom weights", () => {
    const weights: Weights = { technicalSkills: 50, relevantExperience: 20, responsibilities: 10, architecture: 10, seniority: 5, domain: 5, locationRemote: 0, employmentConditions: 0 };
    const scores: DimensionScores = { ...dimensions(0), technicalSkills: 40, locationRemote: 100 };
    expect(weightedScore(scores, weights)).toBe(20);
  });
});

describe("WEIGHTS_SETTING_KEY", () => {
  it("is the setting the weights live under", () => {
    expect(WEIGHTS_SETTING_KEY).toBe("jobIntel:weights");
  });
});
