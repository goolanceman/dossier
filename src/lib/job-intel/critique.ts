import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";

// The detailed job critique (master.md §3.4): what makes the position
// attractive, why the user fits, what they lack, and a clear recommendation.
// The AI task for it lives in src/lib/ai/tasks; this is the schema it must
// answer with and the place the answer is kept, on the posting's JobAssessment
// row. Users can override the AI's decision here, with their reasoning
// recorded (master.md §3.4).

export const critiqueSchema = z.strictObject({
  attractive: z.array(z.string().max(500)).max(10),
  suitable: z.array(z.string().max(500)).max(10),
  lacking: z.array(z.string().max(500)).max(10),
  hiddenRequirements: z.array(z.string().max(500)).max(10),
  interviewDifficulty: z.string().max(2_000),
  seniorityMismatch: z.string().max(1_000),
  concerns: z.array(z.string().max(500)).max(10),
  progression: z.string().max(1_000),
  salaryCompetitiveness: z.string().max(1_000),
  recommendation: z.enum(["APPLY", "APPLY_AFTER_PREPARATION", "SAVE_FOR_LATER", "REJECT"]),
  reasoning: z.string().max(2_000),
});
export type JobCritique = z.output<typeof critiqueSchema>;

/**
 * Stores a critique (master.md §3.4), merging it into the posting's existing
 * assessment row or starting a PENDING one when there is none yet.
 */
export async function saveCritique(postingId: string, critique: JobCritique): Promise<void> {
  const value = critiqueSchema.parse(critique);
  await prisma.jobAssessment.upsert({
    where: { postingId },
    create: { postingId, critique: value, reasons: [] },
    update: { critique: value },
  });
}

/** The user's recorded override of the AI recommendation, or null with no assessment row. */
export async function getUserOverride(postingId: string): Promise<string | null> {
  const row = await prisma.jobAssessment.findUnique({ where: { postingId }, select: { userOverride: true } });
  return row?.userOverride ?? null;
}

/**
 * Records that the user overrode the AI's decision, with their reasoning
 * (master.md §3.4). The reasoning is required: an override without a why is
 * not worth recording.
 */
export async function saveUserOverride(postingId: string, reasoning: string): Promise<void> {
  const reason = reasoning.trim().slice(0, 2_000);
  if (reason === "") throw new Error("Write why you disagree with the AI's recommendation before saving the override.");
  await prisma.jobAssessment.upsert({
    where: { postingId },
    create: { postingId, userOverride: reason, reasons: [] },
    update: { userOverride: reason },
  });
}
