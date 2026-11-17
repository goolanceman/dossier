import { z } from "zod";

import { resumeCritiqueSchema } from "@/lib/ai/task-contracts";

// What the Resume Intelligence screen reads (master.md §5.2): the stored
// critique's JSON columns read back as the contract's data, so nothing is
// rendered that the critique task didn't answer.

/** The overall block, as stored beside the critique. */
export const overallViewSchema = resumeCritiqueSchema.shape.overall;

/** One stored critique, everything the results view shows; `date` is the formatted createdAt. */
export const critiqueViewSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  date: z.string(),
  targetId: z.string().nullable(),
  overall: overallViewSchema,
  findings: resumeCritiqueSchema.shape.findings,
  keywordCoverage: resumeCritiqueSchema.shape.keywordCoverage,
  formattingIssues: resumeCritiqueSchema.shape.formattingIssues,
  // The contract's shape, but no strengths column is stored; it reads back empty.
  strengths: resumeCritiqueSchema.shape.strengths.default([]),
});
export type CritiqueView = z.output<typeof critiqueViewSchema>;

/** A history entry: what the list shows, without the resume's text. */
export type CritiqueSummary = {
  id: string;
  fileName: string;
  date: string;
  /** Null when the stored overall block doesn't parse; the row still opens. */
  score: number | null;
  atsReadiness: string | null;
};

/** The critique job's steps, shared with the client's progress display (as IMPORT_PROFILE_STEPS is). */
export const CRITIQUE_STEPS = ["Loading your profile", "Critiquing the resume", "Saving the critique"] as const;
