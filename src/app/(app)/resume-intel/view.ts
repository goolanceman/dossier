import { z } from "zod";

import type { PaperSize } from "@/generated/prisma/enums";
import type { Unit } from "@/lib/application-data";
import { resumeCritiqueSchema } from "@/lib/ai/task-contracts";
import type { SectionLayout } from "@/lib/resume-sections";
import type { ThemeData } from "@/lib/themes";

// What the Resume Intelligence screen reads (master.md §5.2): the stored
// critique's JSON columns read back as the contract's data, so nothing is
// rendered that the critique task didn't answer.

/** The overall block, as stored beside the critique. */
export const overallViewSchema = resumeCritiqueSchema.shape.overall;

// The marker addFindingEvidence writes into the stored findings JSON (the
// achievement it created for that finding); the contract's parse strips it,
// so the view's finding carries it as an extra nullable field.
export const findingViewSchema = resumeCritiqueSchema.shape.findings.element.extend({
  createdEvidenceId: z.string().nullish(),
});

/** One stored critique, everything the results view shows; `date` is the formatted createdAt. */
export const critiqueViewSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  date: z.string(),
  targetId: z.string().nullable(),
  overall: overallViewSchema,
  findings: z.array(findingViewSchema),
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

/** The master document's preview data, resolved server-side (master.md §5.5). */
export type MasterPreview = {
  id: string;
  units: Unit[];
  theme: ThemeData;
  paper: PaperSize;
  sections: SectionLayout;
  includeReferences: boolean;
  language: string | null;
};

/** The critique job's steps, shared with the client's progress display (as IMPORT_PROFILE_STEPS is). */
export const CRITIQUE_STEPS = ["Loading your profile", "Critiquing the resume", "Saving the critique"] as const;

/** The apply-findings job's steps, for the same progress display (master.md §5.2). */
export const APPLY_STEPS = ["Loading the master resume", "Applying the findings", "Saving the master resume"] as const;

/** The career-plan job's steps (master.md Phase 5: goals drawn from the resume). */
export const PLAN_STEPS = ["Reading your resume", "Planning your goals", "Saving the plan"] as const;
