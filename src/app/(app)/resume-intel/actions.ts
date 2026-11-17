"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { action, ActionError } from "@/lib/action";
import { isAiConfigured } from "@/lib/ai/config";
import { formatDate } from "@/lib/dates";
import { startJob } from "@/lib/jobs/runner";
import { MAX_RESUME_CHARACTERS } from "@/lib/resume-text";
import { deleteCritique as deleteCritiqueRow, findingsByPriority, getCritique } from "@/lib/resume-intel/critique";

import { critiqueResumeJob } from "./jobs";
import { critiqueViewSchema } from "./view";

// The Resume Intelligence page's actions (master.md §5.1–5.2): starting a
// critique of pasted text, opening and deleting stored ones. An upload goes
// through the upload route instead, since Server Actions take at most 1 MB.

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
    return { jobId: await startJob(critiqueResumeJob, { content, fileName, targetId }) };
  },
);

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
