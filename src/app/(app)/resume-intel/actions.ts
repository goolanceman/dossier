"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { action, ActionError } from "@/lib/action";
import { isAiConfigured } from "@/lib/ai/config";
import { createAchievement } from "@/lib/career/achievements";
import { formatDate } from "@/lib/dates";
import { startJob } from "@/lib/jobs/runner";
import { MAX_RESUME_CHARACTERS } from "@/lib/resume-text";
import { deleteCritique as deleteCritiqueRow, findingsByPriority, getCritique } from "@/lib/resume-intel/critique";
import { prisma } from "@/lib/prisma";

import { applyFindingsJob, careerPlanJob, critiqueResumeJob } from "./jobs";
import { loadMasterPreview } from "./master-preview";
import { critiqueViewSchema } from "./view";

// The Resume Intelligence page's actions (master.md §5.1–5.2): starting a
// critique of the base resume or of pasted text, applying findings to the
// master resume, adding a finding's evidence to the library, planning
// career goals, and opening and deleting stored critiques. An upload goes
// through the upload route instead, since Server Actions take at most 1 MB.

/** Starts a critique of the base resume (master.md §5.1): the job builds its text from the profile itself. */
export const runBaseCritique = action(z.object({ targetId: z.string().max(50).default("") }), async ({ targetId }) => {
  if (!(await isAiConfigured())) {
    throw new ActionError("Choose an AI provider in Settings first: it's what critiques the resume.");
  }
  return { jobId: await startJob(critiqueResumeJob, { mode: "BASE", targetId }) };
});

/** Starts a critique of resume text pasted on the page; the upload route does the same for a file. */
export const runCritique = action(
  z.object({
    content: z.string().trim().min(1, "Paste your resume's text first.").max(MAX_RESUME_CHARACTERS),
    fileName: z.string().max(200).default(""),
    targetId: z.string().max(50).default(""),
  }),
  async ({ content, fileName, targetId }) => {
    if (!(await isAiConfigured())) {
      throw new ActionError("Choose an AI provider in Settings first: it's what critiques the resume.");
    }
    return { jobId: await startJob(critiqueResumeJob, { mode: "FILE", content, fileName, targetId }) };
  },
);

/** Applies the ticked findings to the master resume as a background job (master.md §5.2). */
export const applyFindings = action(
  z.object({ critiqueId: z.string().min(1), findingIds: z.array(z.string().max(60)).max(40).default([]) }),
  async ({ critiqueId, findingIds }) => {
    if (!(await isAiConfigured())) {
      throw new ActionError("Choose an AI provider in Settings first: it's what applies the findings to the master resume.");
    }
    const row = await getCritique(critiqueId);
    if (!row) throw new ActionError("That critique isn't there any more. It may have been deleted.");
    return { jobId: await startJob(applyFindingsJob, { critiqueId, findingIds }) };
  },
);

/**
 * Adds one finding's evidence to the library (master.md §5.3): a direct
 * action, no job. The achievement stays IMPORTED: the user verifies it, the
 * model never does. The created id is marked on the finding in the stored
 * JSON, so the chips link to the library and a second click can't duplicate.
 */
export const addFindingEvidence = action(
  z.object({ critiqueId: z.string().min(1), findingId: z.string().min(1) }),
  async ({ critiqueId, findingId }) => {
    const row = await getCritique(critiqueId);
    if (!row) throw new ActionError("That critique isn't there any more. It may have been deleted.");
    const findings = z
      .array(
        z.object({
          id: z.string(),
          title: z.string().default(""),
          recommendation: z.string().default(""),
          evidenceRequired: z.array(z.string()).default([]),
          createdEvidenceId: z.string().optional(),
        }),
      )
      .catch([])
      .parse(row.findings);
    const finding = findings.find((entry) => entry.id === findingId);
    if (!finding) throw new ActionError("That finding isn't in this critique any more.");
    if (finding.createdEvidenceId) return { achievementId: finding.createdEvidenceId };

    const achievement = await createAchievement(
      { title: finding.title, description: finding.recommendation, metrics: finding.evidenceRequired },
      { origin: `resume-critique:${critiqueId}:${findingId}` },
    );
    // The findings column is rewritten as it came, with the marker added: a
    // strict parse here would drop what the contract's read doesn't name.
    const raw = Array.isArray(row.findings) ? row.findings : [];
    await prisma.resumeCritique.update({
      where: { id: critiqueId },
      data: {
        findings: raw.map((item) =>
          typeof item === "object" && item !== null && !Array.isArray(item) && item["id"] === findingId
            ? { ...item, createdEvidenceId: achievement.id }
            : item,
        ),
      },
    });
    return { achievementId: achievement.id };
  },
);

/** Plans career goals from the resume as a background job (master.md Phase 5); the opened critique sharpens it. */
export const runCareerPlan = action(z.object({ critiqueId: z.string().max(50).default("") }), async ({ critiqueId }) => {
  if (!(await isAiConfigured())) {
    throw new ActionError("Choose an AI provider in Settings first: it's what plans your career goals.");
  }
  return { jobId: await startJob(careerPlanJob, { critiqueId }) };
});

/** The master document's preview data, read again after an apply job changed it. */
export const openMasterDocument = action(z.object({}), async () => ({ master: await loadMasterPreview() }));

/** One critique for the results view, its findings already in priority order. */
export const openCritique = action(z.object({ id: z.string().min(1) }), async ({ id }) => {
  const row = await getCritique(id);
  if (!row) throw new ActionError("That critique isn't there any more. It may have been deleted.");
  const view = critiqueViewSchema.safeParse({ ...row, date: formatDate(row.createdAt) });
  if (!view.success) throw new ActionError("This critique can't be shown any more. Delete it and run a new one.");
  // findingsByPriority reads the contract's shape; the stored row keeps only
  // the columns, so the task markers are filled in for the call.
  const sorted = findingsByPriority({ ...view.data, schema_version: "1.0", task: "resume_critique" });
  return { ...view.data, findings: sorted };
});

/** Deletes a stored critique, with the resume text kept beside it. */
export const deleteCritique = action(z.object({ id: z.string().min(1) }), async ({ id }, { toast }) => {
  await deleteCritiqueRow(id);
  revalidatePath("/resume-intel");
  toast("Critique deleted.");
  return null;
});
