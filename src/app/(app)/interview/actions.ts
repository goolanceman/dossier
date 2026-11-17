"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { MockKind, LearningStatus } from "@/generated/prisma/enums";
import { action, ActionError } from "@/lib/action";
import { createStarStory, deletePlan, deleteStarStory, markPrepared, starStoryInputSchema, suggestStoriesForQuestion, updateStarStory } from "@/lib/interview/plans";
import { abandonSession, addTurn, getSession, startSession } from "@/lib/interview/mock";
import { setTopicStatus as setTopicStatusService } from "@/lib/learning/plan";
import { prisma } from "@/lib/prisma";
import { startJob } from "@/lib/jobs/runner";

import { generateInterviewPlanJob, generateLearningPlanJob, mockFeedbackJob } from "./jobs";

// The interview hub's actions (master.md Phases 7–8): thin wrappers around
// the interview, learning and job services, signed in and validated. The AI
// work goes through jobs.ts; these only open sessions, flip prepared flags
// and queue the background work.

const withRefresh = () => revalidatePath("/interview");

const idSchema = z.object({ id: z.string().min(1) });

// ── Interview plans (master.md §7.1–7.3) ─────────────────────────────────────

/** Queues plan generation in the background; the screen follows the job's id. */
export const generatePlan = action(
  z.object({
    role: z.string().trim().min(1, "Give the role a title.").max(200),
    postingId: z.string().min(1).max(100).optional(),
  }),
  async ({ role, postingId }) => {
    const jobId = await startJob(generateInterviewPlanJob, { role, ...(postingId ? { postingId } : {}) }, { key: `interview-plan:${postingId ?? role}` });
    return { jobId };
  },
);

/** Removes a plan for good, with its questions and its mock sessions' link. */
export const removePlan = action(idSchema, async ({ id }) => {
  await deletePlan(id);
  withRefresh();
  return null;
});

/** Marks one predicted question prepared, or un-prepares it. */
export const setQuestionPrepared = action(z.object({ questionId: z.string().min(1), prepared: z.boolean() }), async ({ questionId, prepared }) => {
  await markPrepared(questionId, prepared);
  withRefresh();
  return null;
});

/** The stories that can answer a question, best first, for the plan's cards. */
export const suggestStories = action(z.object({ questionId: z.string().min(1) }), async ({ questionId }) => {
  const stories = await suggestStoriesForQuestion(questionId);
  return stories.map(({ id, title }) => ({ id, title }));
});

// ── Mock interviews (master.md §7.5) ─────────────────────────────────────────

/** Opens a mock session. It asks the plan's questions, or every plan's when no plan is chosen. */
export const startMock = action(
  z.object({ kind: z.enum(MockKind), planId: z.string().min(1).optional() }),
  async ({ kind, planId }) => {
    const questions = await prisma.interviewQuestion.count({ ...(planId ? { where: { planId } } : {}) });
    if (questions === 0) {
      throw new ActionError(planId ? "This plan has no questions yet." : "There are no questions to ask yet. Generate an interview plan first.");
    }
    const session = await startSession({ kind, ...(planId ? { planId } : {}) });
    withRefresh();
    return { sessionId: session.id };
  },
);

/** Submits one answer in a text session and queues the interviewer's verdict. */
export const submitMockAnswer = action(
  z.object({
    sessionId: z.string().min(1),
    question: z.string().trim().min(1).max(2_000),
    answer: z.string().trim().min(1, "Write an answer first.").max(10_000),
  }),
  async ({ sessionId, question, answer }) => {
    const session = await getSession(sessionId);
    if (!session) throw new ActionError("The mock session is no longer there.");
    if (session.kind !== MockKind.TEXT) throw new ActionError("Feedback is graded in text sessions only.");
    const jobId = await startJob(mockFeedbackJob, { sessionId, question, answer });
    return { jobId };
  },
);

/** Records one answer without grading it, for the technical, behavioural and system design kinds. */
export const recordMockTurn = action(
  z.object({
    sessionId: z.string().min(1),
    question: z.string().trim().min(1).max(2_000),
    answer: z.string().trim().min(1, "Write an answer first.").max(10_000),
  }),
  async ({ sessionId, question, answer }) => {
    await addTurn(sessionId, { question, answer });
    withRefresh();
    return null;
  },
);

/** Ends a session without a verdict; the turns so far stay in it. */
export const abandonMock = action(idSchema, async ({ id }) => {
  await abandonSession(id);
  withRefresh();
  return null;
});

// ── STAR story bank (master.md §7.4) ─────────────────────────────────────────

/** Creates a STAR story, or saves the edits to one. */
export const saveStarStory = action(starStoryInputSchema.extend({ id: z.string().min(1).optional() }), async ({ id, ...input }) => {
  const saved = id ? await updateStarStory(id, input) : await createStarStory(input);
  withRefresh();
  return saved;
});

/** Removes a STAR story for good. */
export const removeStarStory = action(idSchema, async ({ id }) => {
  await deleteStarStory(id);
  withRefresh();
  return null;
});

// ── Learning plans (master.md Phase 8) ───────────────────────────────────────

/** Queues a learning plan in the background from a goal, a posting's gaps or a target. */
export const generateLearningPlan = action(
  z.object({
    goal: z.string().trim().min(1, "Say what you want to learn.").max(1_000),
    postingId: z.string().min(1).max(100).optional(),
    targetId: z.string().min(1).max(100).optional(),
  }),
  async ({ goal, postingId, targetId }) => {
    const jobId = await startJob(
      generateLearningPlanJob,
      { goal, ...(postingId ? { postingId } : {}), ...(targetId ? { targetId } : {}) },
      { key: `learning-plan:${postingId ?? targetId ?? goal}` },
    );
    return { jobId };
  },
);

/** Moves one learning topic along the schedule, in either direction. */
export const setTopicStatus = action(z.object({ topicId: z.string().min(1), status: z.enum(LearningStatus) }), async ({ topicId, status }) => {
  await setTopicStatusService(topicId, status);
  withRefresh();
  return null;
});
