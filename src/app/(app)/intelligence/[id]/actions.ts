"use server";

import { z } from "zod";

import { action, ActionError } from "@/lib/action";
import { isAiConfigured } from "@/lib/ai/config";
import { answerQuestion, markUnknown, saveForLater, skipQuestion } from "@/lib/gaps/lifecycle";
import { saveUserOverride } from "@/lib/job-intel/critique";
import type { JobDefinition } from "@/lib/jobs/runner";
import { findUnfinishedJobs, startJob } from "@/lib/jobs/runner";
import { prisma } from "@/lib/prisma";

import {
  assessJobKey,
  assessPostingJob,
  companyJobKey,
  critiqueJobKey,
  critiquePostingJob,
  gapQuestionsJobKey,
  generateGapQuestionsJob,
  learningJobKey,
  createLearningPlanJob,
  prepareInterviewJob,
  interviewJobKey,
  researchCompanyJob,
  researchSalaryJob,
  salaryJobKey,
} from "./jobs";

// Job Intelligence (master.md Phases 3–9). The AI work runs as background
// jobs (jobs.ts); these actions queue them, follow the one already under
// way, and carry the direct gap-question lifecycle steps, which need no job.

const postingId = z.string().min(1).max(100);
const questionId = z.string().min(1).max(50);

/** The posting to work on, or a readable error: a job's own failure would only say something went wrong. */
async function requirePosting(id: string) {
  const posting = await prisma.posting.findUnique({ where: { id }, select: { id: true } });
  if (!posting) throw new ActionError("That posting is gone. Open it again from Find jobs or Discovery.");
}

/**
 * Queues a posting's AI job, following the one already under way for the
 * same posting instead of a second. Needs an AI provider: the page hides the
 * buttons without one, so a call here is stale or forged.
 */
async function queueJob<I, R>(definition: JobDefinition<I, R>, key: string, postingId: string): Promise<{ jobId: string }> {
  if (!(await isAiConfigured())) throw new ActionError("Set up an AI provider in Settings first.");
  await requirePosting(postingId);
  const [unfinished] = await findUnfinishedJobs(key);
  return { jobId: unfinished?.id ?? (await startJob(definition, definition.input.parse({ postingId }), { key })) };
}

export const assessPosting = action(z.object({ postingId }), ({ postingId }) => queueJob(assessPostingJob, assessJobKey(postingId), postingId));

export const researchSalary = action(z.object({ postingId }), ({ postingId }) => queueJob(researchSalaryJob, salaryJobKey(postingId), postingId));

export const critiquePosting = action(z.object({ postingId }), async ({ postingId }) => {
  // The critique is worked out from the assessment, so there has to be one.
  const row = await prisma.jobAssessment.findUnique({ where: { postingId }, select: { score: true } });
  if (!row || row.score === null) throw new ActionError("Assess the posting first; the critique is worked out from its assessment.");
  return queueJob(critiquePostingJob, critiqueJobKey(postingId), postingId);
});

export const generateGapQuestions = action(z.object({ postingId }), ({ postingId }) => queueJob(generateGapQuestionsJob, gapQuestionsJobKey(postingId), postingId));

export const prepareInterview = action(z.object({ postingId }), ({ postingId }) => queueJob(prepareInterviewJob, interviewJobKey(postingId), postingId));

export const createLearningPlan = action(z.object({ postingId }), ({ postingId }) => queueJob(createLearningPlanJob, learningJobKey(postingId), postingId));

export const researchCompany = action(z.object({ postingId }), ({ postingId }) => queueJob(researchCompanyJob, companyJobKey(postingId), postingId));

/** "Disagree" (master.md §3.4): the user's override of the AI recommendation, with the reasoning required. */
export const overrideAssessment = action(
  z.object({ postingId, reasoning: z.string().trim().min(1, "Write why you disagree.").max(2_000) }),
  async ({ postingId, reasoning }, { toast }) => {
    await requirePosting(postingId);
    await saveUserOverride(postingId, reasoning);
    toast("Noted. Your reasoning is kept with the assessment.");
    return null;
  },
);

/** The gap questions (master.md Phase 6): answered, skipped, marked unknown or saved for later, as the user says. */
export const answerGapQuestion = action(
  z.object({ id: questionId, answer: z.string().trim().min(1, "Write an answer first.").max(4_000) }),
  async ({ id, answer }, { toast }) => {
    await answerQuestion(id, answer);
    toast("Answer saved. It stays as you wrote it.");
    return null;
  },
);

export const skipGapQuestion = action(z.object({ id: questionId }), async ({ id }, { toast }) => {
  await skipQuestion(id);
  toast("Skipped. You can generate the questions again later.");
  return null;
});

export const markGapQuestionUnknown = action(z.object({ id: questionId }), async ({ id }, { toast }) => {
  await markUnknown(id);
  toast("Marked as unknown.");
  return null;
});

export const saveGapQuestionForLater = action(z.object({ id: questionId }), async ({ id }, { toast }) => {
  await saveForLater(id);
  toast("Saved for later.");
  return null;
});
