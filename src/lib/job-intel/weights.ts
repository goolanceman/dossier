import "server-only";

import { z } from "zod";
import { dimensionScoresSchema } from "@/lib/ai/task-contracts";
import { prisma } from "@/lib/prisma";

// The configurable scoring formula for job compatibility (master.md §3.2):
// eight dimension scores, each weighted, adding up to a 0-100 score. The
// defaults below are the table in master.md §3.2; Settings can change them,
// and a missing or broken setting falls back to the defaults. This complements
// the existing posting scorer (src/lib/scoring), it does not replace it.

export type WeightKey =
  | "technicalSkills"
  | "relevantExperience"
  | "responsibilities"
  | "architecture"
  | "seniority"
  | "domain"
  | "locationRemote"
  | "employmentConditions";

export const WEIGHT_KEYS: readonly WeightKey[] = [
  "technicalSkills",
  "relevantExperience",
  "responsibilities",
  "architecture",
  "seniority",
  "domain",
  "locationRemote",
  "employmentConditions",
];

export type Weights = Record<WeightKey, number>;
export type DimensionScores = z.output<typeof dimensionScoresSchema>;

/** The default weights, exactly the master.md §3.2 table, summing to 100. */
export const DEFAULT_WEIGHTS: Weights = {
  technicalSkills: 25,
  relevantExperience: 20,
  responsibilities: 15,
  architecture: 10,
  seniority: 10,
  domain: 5,
  locationRemote: 10,
  employmentConditions: 5,
};

/** The Setting key the weights live under (read directly, not via settings.ts). */
export const WEIGHTS_SETTING_KEY = "jobIntel:weights";

/** Eight numbers, each 0-100, that must add up to exactly 100. */
export const weightsSchema = z
  .strictObject({
    technicalSkills: z.number().min(0).max(100),
    relevantExperience: z.number().min(0).max(100),
    responsibilities: z.number().min(0).max(100),
    architecture: z.number().min(0).max(100),
    seniority: z.number().min(0).max(100),
    domain: z.number().min(0).max(100),
    locationRemote: z.number().min(0).max(100),
    employmentConditions: z.number().min(0).max(100),
  })
  .refine((weights) => WEIGHT_KEYS.reduce((sum, key) => sum + weights[key], 0) === 100, "The weights must add up to exactly 100.");

/** Reads the stored weights, or the master.md §3.2 defaults when missing or invalid. */
export async function loadWeights(): Promise<Weights> {
  const setting = await prisma.setting.findUnique({ where: { key: WEIGHTS_SETTING_KEY } });
  if (setting === null) return DEFAULT_WEIGHTS;
  try {
    const parsed = weightsSchema.safeParse(JSON.parse(setting.value));
    return parsed.success ? parsed.data : DEFAULT_WEIGHTS;
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

/** Validates and stores the weights; the sum must be exactly 100. */
export async function saveWeights(input: Weights): Promise<Weights> {
  const parsed = weightsSchema.safeParse(input);
  if (!parsed.success) throw new Error("Set eight weights between 0 and 100 that add up to exactly 100.");
  const value = JSON.stringify(parsed.data);
  await prisma.setting.upsert({ where: { key: WEIGHTS_SETTING_KEY }, create: { key: WEIGHTS_SETTING_KEY, value }, update: { value } });
  return parsed.data;
}

/** The weighted sum of the dimension scores, 0-100, since the weights add up to 100. */
export function weightedScore(dimensions: DimensionScores, weights: Weights): number {
  const total = WEIGHT_KEYS.reduce((sum, key) => sum + dimensions[key] * weights[key], 0);
  return Math.round(total / 100);
}
